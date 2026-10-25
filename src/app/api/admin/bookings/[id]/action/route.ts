import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { readJson } from "@/lib/routeGuards";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { formatDoctorName, formatProviderName } from "@/lib/utils";
import {
  cancelAndRefund, claimStatusChange, isAlreadyClosed, isTransientConflict, ALREADY_CLOSED_MESSAGE, LIVE_STATUSES,
} from "@/lib/appointmentCancel";
import { cancelAndReassign } from "@/lib/reassignment";
import { LIVE_LOCATION_CLEARED } from "@/lib/appointmentView";
import { BOOKING_ACTION_REASON_MIN, BOOKING_ACTION_REASON_MAX } from "@/lib/adminBookingActions";

const ACTIONS = ["CANCEL", "REASSIGN", "NO_SHOW"] as const;
type Action = (typeof ACTIONS)[number];

// POST: an admin cancels (wallet refund), reassigns (doctor bookings only —
// the nearest free doctor, as when a doctor cancels) or marks a no-show on
// one booking. Every path is the same conditional claim the doctor/patient
// routes use, so a racing cancel, double click or provider update makes all
// but one request 409 and the booking is refunded at most once (the refund
// row is unique per appointment). Money only ever goes to the patient's
// wallet — nothing here calls the payment gateway. The admin and their reason
// are kept on the booking (adminAction*) and the refund row (adminId); the
// reason is admin-only, the pushes say what happened, not why.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;

  const action = body.action as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Choose cancel, reassign or no-show." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < BOOKING_ACTION_REASON_MIN) {
    return NextResponse.json({ error: `Add a reason (at least ${BOOKING_ACTION_REASON_MIN} characters) — it's kept on the booking's audit trail.` }, { status: 400 });
  }
  if (reason.length > BOOKING_ACTION_REASON_MAX) {
    return NextResponse.json({ error: `Keep the reason under ${BOOKING_ACTION_REASON_MAX} characters.` }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { patient: { select: { name: true, mobile: true } }, doctor: { select: { name: true } } },
  });
  if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "NO_SHOW" ? appointment.status !== "SCHEDULED" : !LIVE_STATUSES.includes(appointment.status)) {
    return NextResponse.json(
      { error: action === "NO_SHOW" ? "Only a confirmed (scheduled) booking can be marked a no-show." : "Only a pending or scheduled booking can be cancelled or reassigned." },
      { status: 409 }
    );
  }
  if (action === "NO_SHOW" && appointment.scheduledAt.getTime() > Date.now()) {
    return NextResponse.json({ error: "A booking can only be marked a no-show once its time has passed." }, { status: 409 });
  }
  if (action === "REASSIGN" && appointment.providerType === "NURSE") {
    return NextResponse.json({ error: "Nurse bookings can't be reassigned automatically — cancel and refund it instead." }, { status: 400 });
  }
  // Same rule as a doctor cancelling a walk-in: the patient is at that clinic.
  if (action === "REASSIGN" && appointment.bookedById) {
    return NextResponse.json({ error: "A walk-in booking stays with its clinic — cancel and refund it instead." }, { status: 400 });
  }

  const audit = { adminActionBy: authUser.id, adminActionReason: reason, adminActionAt: new Date() };
  const providerName = formatProviderName(appointment.doctor.name, appointment.providerType);
  // Never the patient's mobile — a quick-signup patient may have no name yet.
  const patientLabel = (appointment.patientName || appointment.patient.name || "").trim();
  const when = appointment.scheduledAt;
  const providerDashboard = appointment.providerType === "NURSE" ? "/nurse/dashboard" : "/doctor/dashboard";
  const notifyProvider = (key: "apptCancelledByAdminToProvider" | "apptNoShowByAdminToProvider") =>
    void sendPushToUser(appointment.doctorId, { key, values: { patient: patientLabel, named: patientLabel ? "yes" : "no", when }, url: providerDashboard });

  try {
    if (action === "CANCEL") {
      const { cancelled, refund } = await prisma.$transaction((tx) =>
        cancelAndRefund(tx, id, {
          data: audit,
          adminId: authUser.id,
          note: `Refund for appointment ${id}, cancelled by DocOnClick support`,
        })
      );
      void sendPushToUser(appointment.patientId, {
        key: "apptCancelledByAdmin",
        values: { provider: providerName, when, refunded: refund > 0 ? "yes" : "no", amount: refund },
        url: "/patient/appointments",
      });
      notifyProvider("apptCancelledByAdminToProvider");
      return NextResponse.json({ status: cancelled.status, refund, reassignedTo: null });
    }

    if (action === "REASSIGN") {
      const { cancelled, refund, reassigned, candidate } = await cancelAndReassign(appointment, {
        data: audit,
        adminId: authUser.id,
        note: `Refund for appointment ${id}, reassigned by DocOnClick support`,
      });
      if (reassigned && candidate) {
        void sendPushToUser(candidate.id, {
          key: "reassignedRequestToDoctor",
          values: { patient: appointment.patientName ?? "", named: appointment.patientName ? "yes" : "no", consultType: appointment.consultType },
          url: "/doctor/dashboard",
        });
        void sendPushToUser(appointment.patientId, {
          key: "apptReassignedByAdmin",
          values: { provider: providerName, newDoctor: formatDoctorName(candidate.name), when, refunded: refund > 0 ? "yes" : "no", amount: refund },
          url: "/patient/appointments",
        });
      } else {
        // Nobody free — the helper has cancelled and refunded it instead.
        void sendPushToUser(appointment.patientId, {
          key: "apptCancelledByAdmin",
          values: { provider: providerName, when, refunded: refund > 0 ? "yes" : "no", amount: refund },
          url: "/patient/appointments",
        });
      }
      notifyProvider("apptCancelledByAdminToProvider");
      return NextResponse.json({
        status: cancelled.status,
        refund,
        reassignedTo: reassigned && candidate ? { id: reassigned.id, doctorName: candidate.name } : null,
      });
    }

    // NO_SHOW — like the provider's own no-show: no refund, and since payouts
    // only count COMPLETED visits the provider isn't paid for it either. The
    // claim re-checks status and time on the row.
    const updated = await prisma.$transaction((tx) =>
      claimStatusChange(tx, id, ["SCHEDULED"], {
        status: "NO_SHOW",
        requestedScheduledAt: null,
        ...LIVE_LOCATION_CLEARED,
        ...audit,
      }, { scheduledAt: { lte: new Date() } })
    );
    void sendPushToUser(appointment.patientId, {
      key: "apptNoShowByAdmin",
      values: { provider: providerName, when },
      url: "/patient/appointments",
    });
    notifyProvider("apptNoShowByAdminToProvider");
    return NextResponse.json({ status: updated.status, refund: 0, reassignedTo: null });
  } catch (err) {
    if (isAlreadyClosed(err) || isTransientConflict(err)) {
      return NextResponse.json({ error: ALREADY_CLOSED_MESSAGE }, { status: 409 });
    }
    throw err;
  }
}
