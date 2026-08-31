import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { findReassignmentDoctor } from "@/lib/doctorMatching";
import { getOrCreateWallet } from "@/lib/wallet";
import { commissionPercentForConsultType } from "@/lib/platformFee";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { netPayable, releaseCouponRedemption } from "@/lib/coupons";

const PATIENT_PUSH_COPY: Record<string, { title: string; body: (doctorName: string) => string; url: string }> = {
  SCHEDULED: { title: "Appointment confirmed!", body: (d) => `${d} accepted your request.`, url: "/patient/appointments" },
  REJECTED: { title: "Request declined", body: (d) => `${d} was unable to accept your request.`, url: "/patient/appointments" },
  COMPLETED: { title: "Consultation completed", body: (d) => `Your visit with ${d} is complete.`, url: "/patient/appointments" },
  CANCELLED: { title: "Appointment cancelled", body: (d) => `Your appointment with ${d} was cancelled.`, url: "/patient/appointments" },
};

// Valid status transitions a doctor may make, keyed by the appointment's current status
const DOCTOR_TRANSITIONS: Record<string, string[]> = {
  PENDING_APPROVAL: ["SCHEDULED", "REJECTED"],
  SCHEDULED: ["COMPLETED", "CANCELLED"],
};

// GET: A single appointment, visible only to its own patient or doctor
// (used for lightweight polling, e.g. live travel-status tracking)
export async function GET(
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
    include: {
      doctor: { select: { name: true, doctorProfile: { select: { specialty: true } } } },
      patient: { select: { name: true } },
    },
  });
  if (!appointment || (appointment.patientId !== authUser.id && appointment.doctorId !== authUser.id)) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  return NextResponse.json(appointment);
}

// PATCH: Doctor accepts/rejects/completes/cancels their own appointment;
// patient cancels their own not-yet-completed appointment.
export async function PATCH(
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

  const { status, doctorNotes } = await req.json();

  if (authUser.role === "DOCTOR") {
    if (appointment.doctorId !== authUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const suspendedResponse = await requireActiveDoctor(authUser);
    if (suspendedResponse) return suspendedResponse;
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

    // A doctor cancelling an already-accepted (SCHEDULED) appointment leaves
    // the patient stranded otherwise — try to auto-book the nearest other
    // available doctor in their place. Any online payment already collected
    // can't carry over (the new appointment starts unpaid), so it's credited
    // to the patient's wallet instead of lost.
    if (status === "CANCELLED") {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: appointment.doctorId },
        select: { specialty: true },
      });
      const wasPaid = appointment.paymentStatus === "PAID";
      // The patient only ever paid the coupon-discounted amount, so that's
      // what gets refunded to their wallet.
      const refundAmount = netPayable(appointment);
      const candidate = doctorProfile
        ? await findReassignmentDoctor({
            excludeDoctorId: appointment.doctorId,
            specialty: doctorProfile.specialty,
            consultType: appointment.consultType,
            patientId: appointment.patientId,
          })
        : null;

      let newAmount = 0;
      let newPlatformFee = 0;
      if (candidate) {
        const settings = await prisma.platformSettings.findFirst();
        const commission = commissionPercentForConsultType(settings, appointment.consultType);
        newAmount = candidate.fee;
        newPlatformFee = (newAmount * commission) / 100;
      }

      const { cancelled, reassigned } = await prisma.$transaction(async (tx) => {
        const cancelled = await tx.appointment.update({
          where: { id },
          data: { status: "CANCELLED", doctorNotes: doctorNotes ?? appointment.doctorNotes },
        });

        if (wasPaid) {
          const wallet = await getOrCreateWallet(tx, appointment.patientId);
          const updatedWallet = await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: refundAmount } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: "REASSIGNMENT_CREDIT",
              amount: refundAmount,
              balanceAfter: updatedWallet.balance,
              status: "SUCCESS",
              note: `Refund for appointment ${appointment.id}, cancelled by the doctor`,
            },
          });
        } else {
          // Unpaid: free the coupon slot the patient had reserved.
          await releaseCouponRedemption(tx, { appointmentId: id });
        }

        const reassigned = candidate
          ? await tx.appointment.create({
              data: {
                patientId: appointment.patientId,
                doctorId: candidate.id,
                symptoms: appointment.symptoms,
                patientName: appointment.patientName,
                relation: appointment.relation,
                allergies: appointment.allergies,
                dependentId: appointment.dependentId ?? undefined,
                consentGiven: appointment.consentGiven,
                consultType: appointment.consultType,
                isEmergency: appointment.isEmergency,
                amount: newAmount,
                platformFee: newPlatformFee,
                status: "PENDING_APPROVAL",
                paymentMethod: appointment.paymentMethod,
                paymentStatus: "PENDING",
                clinicId: candidate.clinicId ?? undefined,
                scheduledAt: appointment.scheduledAt,
                reassignedFromId: appointment.id,
              },
            })
          : null;

        return { cancelled, reassigned };
      });

      if (reassigned && candidate) {
        void sendPushToUser(candidate.id, {
          title: "New appointment request",
          body: `${appointment.patientName ?? "A patient"} needs a ${appointment.consultType.toLowerCase()} consultation.`,
          url: "/doctor/dashboard",
        });
        void sendPushToUser(appointment.patientId, {
          title: "Your appointment was reassigned",
          body: wasPaid
            ? `${authUser.name} had an emergency and couldn't continue with your appointment. We found you Dr. ${candidate.name} nearby and credited ₹${refundAmount} back to your wallet — pay again once they accept.`
            : `${authUser.name} had an emergency and couldn't continue with your appointment. We found you Dr. ${candidate.name} nearby and sent them your request.`,
          url: "/patient/appointments",
        });
      } else {
        void sendPushToUser(appointment.patientId, {
          title: "Appointment cancelled",
          body: wasPaid
            ? `${authUser.name} had an emergency and couldn't continue with your appointment. We couldn't find another doctor nearby right now — ₹${refundAmount} has been credited to your wallet. Please book again.`
            : `${authUser.name} had an emergency and couldn't continue with your appointment. We couldn't find another doctor nearby right now — please book again.`,
          url: "/patient/appointments",
        });
      }

      return NextResponse.json(cancelled);
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status,
        doctorNotes: doctorNotes ?? appointment.doctorNotes,
        ...(status === "SCHEDULED" ? { acceptedAt: new Date() } : {}),
        ...(status === "COMPLETED" && appointment.paymentMethod === "CASH"
          ? { paymentStatus: "PAID" }
          : {}),
      },
    });
    const copy = PATIENT_PUSH_COPY[status];
    if (copy) {
      void sendPushToUser(appointment.patientId, {
        title: copy.title,
        body: copy.body(authUser.name),
        url: copy.url,
      });
    }
    return NextResponse.json(updated);
  }

  if (authUser.role === "PATIENT") {
    if (appointment.patientId !== authUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    if (status !== "CANCELLED" || appointment.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        { error: "This appointment can no longer be cancelled." },
        { status: 400 }
      );
    }
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    void sendPushToUser(appointment.doctorId, {
      title: "Appointment cancelled",
      body: `${authUser.name} cancelled their appointment request.`,
      url: "/doctor/dashboard",
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
}
