import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { refundAppointmentToWallet } from "@/lib/wallet";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { resolveProviderScope } from "@/lib/providerGuard";
import { nurseSlotProblem } from "@/lib/nurseSchedule";
import { shiftCompleteProblem, isShift, SHIFT_MIN_LEAD_MS } from "@/lib/nursePackage";
import { netPayable } from "@/lib/coupons";
import { cancelAndRefund, claimStatusChange, isAlreadyClosed, ALREADY_CLOSED_MESSAGE } from "@/lib/appointmentCancel";
import { cancelAndReassign } from "@/lib/reassignment";
import { isDoctorBookable, DOCTOR_BOOKABLE_SELECT, UNBOOKABLE_MESSAGE } from "@/lib/doctorBookable";
import { doctorSlotProblem, snapToClinicGrid, isTimedBooking, isSlotIndexViolation, acceptTimeProblem } from "@/lib/doctorSlots";
import { getBookingHorizonDays, horizonProblem, doctorHoursProblem } from "@/lib/bookingLimits";
import { referralPushCopy } from "@/lib/nurseReferral";
import { settleIfFreeOnAccept } from "@/lib/paymentOrders";
import { GATEWAY_OMIT, LIVE_LOCATION_CLEARED, withLiveLocationOnlyWhileLive } from "@/lib/appointmentView";
import { withErrorLocale } from "@/lib/apiErrors";

// Patient push per new status (messages/<locale>/push.json). The confirmed
// copy adds "Nothing to pay" when `free` is "yes" (a ₹0 booking marked PAID on accept).
const PATIENT_PUSH_KEY = {
  SCHEDULED: "apptConfirmed",
  REJECTED: "apptDeclined",
  COMPLETED: "apptCompleted",
  CANCELLED: "apptCancelled",
  NO_SHOW: "apptNoShow",
} as const;
const patientPushKey = (status: string) =>
  status in PATIENT_PUSH_KEY ? PATIENT_PUSH_KEY[status as keyof typeof PATIENT_PUSH_KEY] : null;

const SLOT_TAKEN_MESSAGE = "That time was just taken. Please pick a different slot.";

// Valid status transitions a doctor may make, keyed by the appointment's current status
const DOCTOR_TRANSITIONS: Record<string, string[]> = {
  PENDING_APPROVAL: ["SCHEDULED", "REJECTED"],
  SCHEDULED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
};

// GET: A single appointment, visible only to its own patient or doctor
// (used for lightweight polling, e.g. live travel-status tracking)
export const GET = withErrorLocale(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    omit: GATEWAY_OMIT,
    include: {
      doctor: { select: { name: true, doctorProfile: { select: { specialty: true } } } },
      patient: { select: { name: true } },
    },
  });
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  let authorized = appointment.patientId === authUser.id || appointment.doctorId === authUser.id;
  if (!authorized && authUser.role === "STAFF") {
    const scope = await resolveDoctorScope(authUser);
    authorized = !scope.denied && appointment.doctorId === scope.doctorId;
  }
  if (!authorized) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const isPatient = appointment.patientId === authUser.id;
  // The visit-start code proves the nurse is actually at the patient's door —
  // only the patient may ever see it.
  // The provider's live position only while they're on the way (see /patient/track).
  const { visitOtp, ...rest } = withLiveLocationOnlyWhileLive(appointment);
  // A package is paid in one go — the payment page needs the whole bill.
  let pkg = null;
  if (isPatient && appointment.packageId) {
    const sessions = await prisma.appointment.findMany({
      where: { packageId: appointment.packageId },
      select: { status: true, paymentStatus: true, amount: true, discountAmount: true },
    });
    const unpaid = sessions.filter((x) => x.status === "SCHEDULED" && x.paymentStatus !== "PAID");
    pkg = {
      visits: sessions.length,
      unpaidCount: unpaid.length,
      unpaidTotal: unpaid.reduce((sum, x) => sum + netPayable(x), 0),
    };
  }
  return NextResponse.json({ ...rest, ...(isPatient ? { visitOtp } : {}), package: pkg });
});

// Provider-facing responses must never carry the patient's door code.
function withoutVisitCode<T extends { visitOtp?: string | null }>(row: T): Omit<T, "visitOtp"> {
  const { visitOtp: _code, ...rest } = row;
  void _code;
  return rest;
}

function newVisitCode() {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

// PATCH: Doctor accepts/rejects/completes/cancels their own appointment;
// patient cancels their own not-yet-completed appointment.
export const PATCH = withErrorLocale(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  await expireStalePendingRequests();
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const { status, doctorNotes, scheduledAt, reschedule, withdrawReschedule } = await req.json();

  // Nurse bookings share this table — "provider" below is the doctor or nurse.
  const providerWord = appointment.providerType === "NURSE" ? "nurse" : "doctor";
  const providerDashboard = appointment.providerType === "NURSE" ? "/nurse/dashboard" : "/doctor/dashboard";

  if (authUser.role === "DOCTOR" || authUser.role === "STAFF" || authUser.role === "NURSE") {
    // Accepting (a request or a new time) and completing are what a plan pays
    // for; cancelling, declining and no-shows stay open to an expired doctor
    // so their patients are still refunded / reassigned.
    const needsPlan = status === "SCHEDULED" || status === "COMPLETED" || reschedule === "ACCEPT";
    const scope = await resolveProviderScope(authUser, { requireSubscription: needsPlan });
    if (scope.denied) return scope.denied;
    if (appointment.doctorId !== scope.doctorId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    // Visit completion is clinical documentation (prescriptions etc.) —
    // staff can manage the queue but not close out a consultation.
    if (authUser.role === "STAFF" && status === "COMPLETED") {
      return NextResponse.json({ error: "Only the doctor can mark a visit complete." }, { status: 403 });
    }
    const actingDoctorName = authUser.role === "DOCTOR" || authUser.role === "NURSE"
      ? authUser.name
      : (await prisma.user.findUnique({ where: { id: scope.doctorId }, select: { name: true } }))?.name ?? "Your doctor";
    // The provider's answer to a patient's request to move an accepted
    // appointment (see the PATIENT branch below). Until then the booking —
    // and its payment — stand at the original time.
    if (reschedule !== undefined) {
      if (reschedule !== "ACCEPT" && reschedule !== "DECLINE") {
        return NextResponse.json({ error: "Invalid reschedule response" }, { status: 400 });
      }
      const requested = appointment.requestedScheduledAt;
      if (appointment.status !== "SCHEDULED" || !requested) {
        return NextResponse.json({ error: "There's no pending reschedule request on this appointment." }, { status: 409 });
      }
      if (reschedule === "ACCEPT") {
        if (requested.getTime() <= Date.now()) {
          return NextResponse.json({ error: "The requested time has already passed." }, { status: 409 });
        }
        if (appointment.consultType === "HOME" && appointment.travelStatus !== "NOT_STARTED") {
          return NextResponse.json(
            { error: "You're already on the way for the original time — please talk to the patient before changing it." },
            { status: 400 }
          );
        }
        if (appointment.providerType === "NURSE") {
          const svc = appointment.nurseServiceId
            ? await prisma.nurseService.findUnique({ where: { id: appointment.nurseServiceId }, select: { durationMinutes: true } })
            : null;
          const problem = await nurseSlotProblem({
            nurseId: appointment.doctorId,
            availability: null,
            when: requested,
            durationMinutes: svc?.durationMinutes,
            excludeAppointmentId: appointment.id,
            viewer: "nurse",
            checkHours: false,
          });
          if (problem) return NextResponse.json({ error: problem }, { status: 409 });
        }
        if (appointment.providerType !== "NURSE") {
          const problem = await doctorSlotProblem({
            doctorId: appointment.doctorId, when: requested, excludeAppointmentId: appointment.id, against: "confirmed", viewer: "doctor",
          });
          if (problem) return NextResponse.json({ error: problem }, { status: 409 });
        }
      }
      // Conditional on the exact request answered — the patient may have
      // changed or withdrawn it in the meantime.
      let count: number;
      try {
        ({ count } = await prisma.appointment.updateMany({
          where: { id, status: "SCHEDULED", requestedScheduledAt: requested },
          data: reschedule === "ACCEPT"
            ? { scheduledAt: requested, requestedScheduledAt: null, reminderSentAt: null }
            : { requestedScheduledAt: null },
        }));
      } catch (err) {
        if (isSlotIndexViolation(err)) return NextResponse.json({ error: SLOT_TAKEN_MESSAGE }, { status: 409 });
        throw err;
      }
      if (count === 0) {
        return NextResponse.json({ error: "This request was already answered or changed. Please refresh." }, { status: 409 });
      }
      void sendPushToUser(appointment.patientId, reschedule === "ACCEPT"
        ? { key: "rescheduleAccepted", values: { doctor: actingDoctorName, when: requested }, url: "/patient/appointments" }
        : { key: "rescheduleDeclined", values: { doctor: actingDoctorName, when: appointment.scheduledAt }, url: "/patient/appointments" });
      const updated = await prisma.appointment.findUniqueOrThrow({ where: { id } });
      return NextResponse.json(withoutVisitCode(updated));
    }

    if (appointment.status === "EXPIRED") {
      return NextResponse.json(
        { error: "This request timed out and the patient has already been notified — it can no longer be accepted." },
        { status: 409 }
      );
    }
    const allowed = DOCTOR_TRANSITIONS[appointment.status] ?? [];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    // Nurse accept / decline. A package is answered as a whole (one request
    // card for the nurse), so every still-pending visit in it moves together.
    // Each accepted visit gets its own door code.
    if (appointment.providerType === "NURSE" && (status === "SCHEDULED" || (status === "REJECTED" && appointment.paymentStatus !== "PAID"))) {
      const group = appointment.packageId
        ? await prisma.appointment.findMany({
            where: { packageId: appointment.packageId, status: "PENDING_APPROVAL", paymentStatus: { not: "PAID" } },
            orderBy: { scheduledAt: "asc" },
          })
        : [appointment];
      if (!group.some((g) => g.id === appointment.id)) group.push(appointment);

      if (status === "SCHEDULED") {
        // A nurse is one person on the road — don't let her confirm two
        // overlapping home visits.
        const svc = appointment.nurseServiceId
          ? await prisma.nurseService.findUnique({ where: { id: appointment.nurseServiceId }, select: { durationMinutes: true } })
          : null;
        for (const g of group) {
          const problem = await nurseSlotProblem({
            nurseId: appointment.doctorId,
            availability: null,
            when: new Date(Math.max(g.scheduledAt.getTime(), Date.now())),
            durationMinutes: svc?.durationMinutes,
            excludeAppointmentId: g.id,
            viewer: "nurse",
            checkHours: false,
          });
          if (problem) {
            const which = group.length > 1 ? `Visit ${g.packageIndex ?? ""}: ` : "";
            return NextResponse.json({ error: which + problem }, { status: 409 });
          }
        }
      }

      const now = new Date();
      await prisma.$transaction(
        group.map((g) => prisma.appointment.update({
          where: { id: g.id },
          data: status === "SCHEDULED"
            ? { status, acceptedAt: now, visitOtp: newVisitCode(), visitOtpAttempts: 0 }
            : { status, doctorNotes: doctorNotes ?? g.doctorNotes },
        }))
      );
      // A ₹0 booking has no payment step — PAID as soon as it's accepted.
      const free = status === "SCHEDULED" ? await settleIfFreeOnAccept(group) : new Set<string>();
      const key = group.length > 1
        ? (status === "SCHEDULED" ? "nursePackageAccepted" : "nursePackageDeclined")
        : patientPushKey(status);
      if (key) {
        void sendPushToUser(appointment.patientId, {
          key,
          values: {
            doctor: actingDoctorName,
            count: group.length,
            free: free.size > 0 && free.size === group.length ? "yes" : "no",
          },
          url: "/patient/appointments",
        });
      }
      const { visitOtp: _hidden, ...updated } = await prisma.appointment.findUniqueOrThrow({ where: { id } });
      void _hidden;
      return NextResponse.json({ ...updated, groupSize: group.length });
    }
    if (status === "COMPLETED" && appointment.providerType === "NURSE" && !appointment.visitStartedAt) {
      return NextResponse.json(
        { error: "Start the visit with the patient's 4-digit code before completing it." },
        { status: 400 }
      );
    }
    if (status === "COMPLETED" && appointment.providerType === "NURSE" && appointment.visitStartedAt && appointment.nurseServiceId) {
      const svc = await prisma.nurseService.findUnique({ where: { id: appointment.nurseServiceId }, select: { kind: true, durationMinutes: true } });
      const early = svc?.kind === "SHIFT" ? shiftCompleteProblem(appointment.visitStartedAt, svc.durationMinutes) : null;
      if (early) return NextResponse.json({ error: early, code: "SHIFT_NOT_OVER" }, { status: 400 });
    }
    if (status === "COMPLETED" && appointment.consultType === "HOME" && appointment.travelStatus !== "ARRIVED") {
      return NextResponse.json(
        { error: "Mark your journey as arrived before completing this home visit." },
        { status: 400 }
      );
    }
    if (status === "COMPLETED" && appointment.paymentMethod === "ONLINE" && appointment.paymentStatus !== "PAID") {
      return NextResponse.json(
        { error: "The patient hasn't completed payment yet. You can mark this consultation complete once payment is received." },
        { status: 400 }
      );
    }

    // A no-show is the patient's fault, not the doctor's — unlike CANCELLED
    // (below) it never refunds the patient or reassigns the slot, and it
    // falls through to the generic status-update path at the end of this
    // handler. Guarded the same way as COMPLETED: a home visit needs the
    // doctor to have actually arrived, and it can't be backdated to a time
    // that hasn't happened yet (both guard against a doctor pre-emptively
    // no-showing a patient to dodge a booking).
    if (status === "NO_SHOW") {
      if (appointment.consultType === "HOME" && appointment.travelStatus !== "ARRIVED") {
        return NextResponse.json(
          { error: "Mark your journey as arrived before marking this a no-show." },
          { status: 400 }
        );
      }
      if (appointment.scheduledAt.getTime() > Date.now()) {
        return NextResponse.json(
          { error: "You can only mark a no-show once the scheduled time has passed." },
          { status: 400 }
        );
      }
    }

    // A doctor cancelling an already-accepted (SCHEDULED) appointment leaves
    // the patient stranded otherwise — try to auto-book the nearest other
    // available doctor in their place. Any online payment already collected
    // can't carry over (the new appointment starts unpaid), so it's credited
    // to the patient's wallet instead of lost.
    if (status === "CANCELLED") {
      let result;
      try {
        result = await cancelAndReassign(appointment, {
          data: { doctorNotes: doctorNotes ?? appointment.doctorNotes },
          note: `Refund for appointment ${appointment.id}, cancelled by the doctor`,
        });
      } catch (err) {
        if (isAlreadyClosed(err)) return NextResponse.json({ error: ALREADY_CLOSED_MESSAGE }, { status: 409 });
        throw err;
      }
      const { cancelled, reassigned, candidate, wasPaid, refund: refundAmount } = result;

      if (reassigned && candidate) {
        void sendPushToUser(candidate.id, {
          key: "reassignedRequestToDoctor",
          values: { patient: appointment.patientName ?? "", named: appointment.patientName ? "yes" : "no", consultType: appointment.consultType },
          url: "/doctor/dashboard",
        });
        void sendPushToUser(appointment.patientId, {
          key: "apptReassigned",
          values: { doctor: actingDoctorName, newDoctor: candidate.name, paid: wasPaid ? "yes" : "no", amount: refundAmount },
          url: "/patient/appointments",
        });
      } else {
        void sendPushToUser(appointment.patientId, {
          key: "apptCancelledNoReplacement",
          values: { doctor: actingDoctorName, providerType: appointment.providerType, paid: wasPaid ? "yes" : "no", amount: refundAmount },
          url: "/patient/appointments",
        });
      }

      return NextResponse.json(withoutVisitCode(cancelled));
    }

    // A rejection is normally free (PENDING_APPROVAL appointments are never
    // paid — online payment only happens after acceptance). The one
    // exception is a previously-accepted, already-paid appointment that a
    // patient reopened to PENDING_APPROVAL via a reschedule request — if the
    // doctor can't make the new time, the patient's money needs to come back.
    // (Reschedules no longer reopen accepted appointments — they're held as
    // requestedScheduledAt — so this only covers rows from before that.)
    if (status === "REJECTED" && appointment.paymentStatus === "PAID") {
      const refundAmount = netPayable(appointment);
      let updated;
      try {
        updated = await prisma.$transaction(async (tx) => {
          const rejected = await claimStatusChange(tx, id, ["PENDING_APPROVAL"], {
            status: "REJECTED",
            doctorNotes: doctorNotes ?? appointment.doctorNotes,
          });
          await refundAppointmentToWallet(tx, {
            patientId: appointment.patientId,
            appointmentId: appointment.id,
            amount: refundAmount,
            type: "CANCELLATION_REFUND",
            note: `Refund for appointment ${appointment.id}, declined by the doctor after a reschedule request`,
          });
          return rejected;
        });
      } catch (err) {
        if (isAlreadyClosed(err)) return NextResponse.json({ error: ALREADY_CLOSED_MESSAGE }, { status: 409 });
        throw err;
      }
      void sendPushToUser(appointment.patientId, {
        key: "rescheduleDeclinedRefunded",
        values: { doctor: actingDoctorName, amount: refundAmount },
        url: "/patient/appointments",
      });
      return NextResponse.json(withoutVisitCode(updated));
    }

    // Accepting confirms the slot — it must not overlap one the doctor has
    // already confirmed (another clinic, a video call…). Nurse accepts are
    // checked above with their visit durations.
    if (status === "SCHEDULED" && appointment.providerType !== "NURSE") {
      // Same checks bulk-accept runs (src/lib/doctorSlots.ts).
      const timeProblem = await acceptTimeProblem(appointment);
      if (timeProblem) return NextResponse.json({ error: timeProblem }, { status: 409 });
    }
    if (status === "SCHEDULED" && appointment.providerType !== "NURSE" && isTimedBooking(appointment)) {
      const problem = await doctorSlotProblem({
        doctorId: appointment.doctorId, when: appointment.scheduledAt, excludeAppointmentId: appointment.id, against: "confirmed", viewer: "doctor",
      });
      if (problem) return NextResponse.json({ error: problem }, { status: 409 });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status,
        // Completed / no-show / declined: any pending new-time request is moot.
        requestedScheduledAt: null,
        doctorNotes: doctorNotes ?? appointment.doctorNotes,
        ...(status === "SCHEDULED" ? { acceptedAt: new Date() } : {}),
        // Starts the prescription edit window (src/lib/prescriptionLock.ts).
        ...(status === "COMPLETED" ? { completedAt: new Date() } : {}),
        // The visit is over (or never happens) — don't keep where the provider was.
        ...(status !== "SCHEDULED" ? LIVE_LOCATION_CLEARED : {}),
        // Cash is collected at the visit, so completing it is when it was paid.
        ...(status === "COMPLETED" && appointment.paymentMethod === "CASH"
          ? { paymentStatus: "PAID", paidAt: appointment.paidAt ?? new Date() }
          : {}),
      },
    });
    // A ₹0 booking has no payment step — PAID as soon as it's accepted.
    const free = status === "SCHEDULED" && (await settleIfFreeOnAccept([updated])).size > 0;
    const key = patientPushKey(status);
    if (key) {
      void sendPushToUser(appointment.patientId, {
        key,
        values: { doctor: actingDoctorName, free: free ? "yes" : "no" },
        url: "/patient/appointments",
      });
    }
    // Nurse care the doctor added during the consultation becomes bookable
    // now (src/lib/nurseReferral.ts) — tell the patient.
    if (status === "COMPLETED") {
      const referral = await prisma.nurseReferral.findUnique({ where: { appointmentId: id }, select: { service: { select: { name: true } } } });
      if (referral) void sendPushToUser(appointment.patientId, referralPushCopy(actingDoctorName, referral.service.name));
    }
    return NextResponse.json(withoutVisitCode(free ? await prisma.appointment.findUniqueOrThrow({ where: { id } }) : updated));
  }

  if (authUser.role === "PATIENT") {
    if (appointment.patientId !== authUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (withdrawReschedule) {
      const { count } = await prisma.appointment.updateMany({
        where: { id, status: "SCHEDULED", requestedScheduledAt: { not: null } },
        data: { requestedScheduledAt: null },
      });
      if (count === 0) {
        return NextResponse.json({ error: "There's no pending reschedule request to withdraw." }, { status: 409 });
      }
      void sendPushToUser(appointment.doctorId, {
        key: "rescheduleWithdrawn",
        values: { patient: authUser.name, when: appointment.scheduledAt },
        url: providerDashboard,
      });
      return NextResponse.json(await prisma.appointment.findUniqueOrThrow({ where: { id } }));
    }

    if (scheduledAt) {
      if (!["PENDING_APPROVAL", "SCHEDULED"].includes(appointment.status)) {
        return NextResponse.json(
          { error: "This appointment can no longer be rescheduled." },
          { status: 400 }
        );
      }
      // Once the doctor has actually set off (or arrived) for a home visit,
      // they're already committed to right now — a reschedule at that point
      // needs to go through them directly, not silently move their trip.
      if (appointment.consultType === "HOME" && appointment.travelStatus !== "NOT_STARTED") {
        return NextResponse.json(
          { error: `The ${providerWord} is already on the way — please contact them directly to reschedule.` },
          { status: 400 }
        );
      }
      // Moving to a new time is a fresh booking of the doctor's slot, so it
      // needs a doctor patients can book right now (cancelling never does).
      if (appointment.providerType !== "NURSE") {
        const doctor = await prisma.user.findUnique({ where: { id: appointment.doctorId }, select: DOCTOR_BOOKABLE_SELECT });
        if (!isDoctorBookable(doctor)) {
          return NextResponse.json(
            { error: `${UNBOOKABLE_MESSAGE} You can keep your current time or cancel this appointment.` },
            { status: 409 }
          );
        }
      }
      const picked = new Date(scheduledAt);
      if (Number.isNaN(picked.getTime()) || picked.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Please pick a time in the future." }, { status: 400 });
      }
      let when = new Date(Math.floor(picked.getTime() / 60_000) * 60_000);
      const tooFar = horizonProblem(when, await getBookingHorizonDays());
      if (tooFar) return NextResponse.json({ error: tooFar }, { status: 400 });
      if (appointment.consultType === "CLINIC" && appointment.clinicId) {
        const clinic = await prisma.clinic.findUnique({
          where: { id: appointment.clinicId },
          select: { slots: true, leaves: true },
        });
        if (clinic) {
          // Only the slots the slots API offers — same grid as a new booking.
          const snapped = snapToClinicGrid(clinic, when);
          if (snapped.error !== null) return NextResponse.json({ error: snapped.error }, { status: 400 });
          when = snapped.when;
        }
      }
      if (appointment.status === "SCHEDULED" && when.getTime() === appointment.scheduledAt.getTime()) {
        return NextResponse.json({ error: "That's already your appointment time." }, { status: 400 });
      }
      if (appointment.providerType === "NURSE") {
        const [nurseProfile, svc] = await Promise.all([
          prisma.nurseProfile.findUnique({ where: { userId: appointment.doctorId }, select: { availability: true } }),
          appointment.nurseServiceId
            ? prisma.nurseService.findUnique({ where: { id: appointment.nurseServiceId }, select: { durationMinutes: true, kind: true } })
            : null,
        ]);
        // Same lead time as booking a shift (nurse-bookings): planned care, so
        // the nurse needs at least an hour's notice of the new start.
        if (isShift(svc) && when.getTime() < Date.now() + SHIFT_MIN_LEAD_MS) {
          return NextResponse.json({ error: "Pick the shift's new start time — at least an hour from now." }, { status: 400 });
        }
        const problem = await nurseSlotProblem({
          nurseId: appointment.doctorId,
          availability: nurseProfile?.availability,
          when,
          durationMinutes: svc?.durationMinutes,
          excludeAppointmentId: appointment.id,
          viewer: "patient",
          // Shifts aren't bound by her daily visiting hours (see nurse-bookings).
          checkHours: svc?.kind !== "SHIFT",
        });
        if (problem) return NextResponse.json({ error: problem }, { status: 409 });
      }
      if (appointment.providerType !== "NURSE" && appointment.consultType !== "CLINIC") {
        // Same rule as a new home/video booking: within the doctor's set hours.
        const profile = await prisma.doctorProfile.findUnique({ where: { userId: appointment.doctorId }, select: { availability: true } });
        const outside = doctorHoursProblem(profile?.availability, when);
        if (outside) return NextResponse.json({ error: outside, code: "OUTSIDE_HOURS" }, { status: 400 });
      }
      if (appointment.providerType !== "NURSE") {
        const problem = await doctorSlotProblem({
          doctorId: appointment.doctorId, when, excludeAppointmentId: appointment.id, against: "live", viewer: "patient",
        });
        if (problem) return NextResponse.json({ error: problem }, { status: 409 });
      }

      // An accepted appointment keeps its original time — and its payment —
      // until the provider accepts the new one (requestedScheduledAt); the
      // patient never loses a confirmed booking because nobody answered. A
      // still-pending request just gets its time updated in place; the
      // provider hasn't reviewed it yet either way. Conditional on the status
      // read above, in case the provider is accepting/cancelling right now.
      const isRequest = appointment.status === "SCHEDULED";
      let count: number;
      try {
        ({ count } = await prisma.appointment.updateMany({
          where: { id, status: appointment.status },
          data: isRequest ? { requestedScheduledAt: when } : { scheduledAt: when, reminderSentAt: null },
        }));
      } catch (err) {
        if (isSlotIndexViolation(err)) return NextResponse.json({ error: SLOT_TAKEN_MESSAGE }, { status: 409 });
        throw err;
      }
      if (count === 0) {
        return NextResponse.json({ error: ALREADY_CLOSED_MESSAGE }, { status: 409 });
      }

      void sendPushToUser(appointment.doctorId, isRequest
        ? { key: "rescheduleRequested", values: { patient: authUser.name, when }, url: providerDashboard }
        : { key: "rescheduleRequestUpdated", values: { patient: authUser.name }, url: providerDashboard });
      return NextResponse.json(await prisma.appointment.findUniqueOrThrow({ where: { id } }));
    }

    if (status !== "CANCELLED" || !["PENDING_APPROVAL", "SCHEDULED"].includes(appointment.status)) {
      return NextResponse.json(
        { error: "This appointment can no longer be cancelled." },
        { status: 400 }
      );
    }
    // Once the doctor has actually arrived for a home visit, cancelling
    // in-app would strand them mid-trip — the patient needs to sort that
    // out with the doctor directly instead.
    if (appointment.consultType === "HOME" && appointment.travelStatus === "ARRIVED") {
      return NextResponse.json(
        { error: `The ${providerWord} has already arrived — please contact them directly to cancel.` },
        { status: 400 }
      );
    }

    // Same cancel-and-refund as the doctor-cancel branch above, minus the
    // reassignment attempt — the patient is choosing to leave, not being left
    // stranded, so there's no substitute doctor to find.
    let result;
    try {
      result = await prisma.$transaction((tx) =>
        cancelAndRefund(tx, id, { note: `Refund for appointment ${appointment.id}, cancelled by the patient` })
      );
    } catch (err) {
      if (isAlreadyClosed(err)) return NextResponse.json({ error: ALREADY_CLOSED_MESSAGE }, { status: 409 });
      throw err;
    }
    const { cancelled: updated, wasPaid, refund: refundAmount } = result;

    void sendPushToUser(appointment.doctorId, {
      key: "apptCancelledByPatient",
      values: { patient: authUser.name, paid: wasPaid ? "yes" : "no", amount: refundAmount },
      url: providerDashboard,
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
});
