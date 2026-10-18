import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { formatDoctorName } from "@/lib/utils";
import {
  AppointmentAlreadyClosedError, affectedBookingSummary, cancelManyAndRefund, needsBookingConfirmation,
} from "@/lib/appointmentCancel";
import { cancelAndReassign } from "@/lib/reassignment";

// The impact step before an admin suspends or deletes a doctor/nurse, or
// deletes a patient: their future live bookings (and a patient's wallet
// balance) come back for review first, and the admin confirms what happens
// to those bookings — cancel + refund to the wallet, or, for doctors,
// reassign to another free doctor where one exists — before anything runs.

export type BookingAction = "CANCEL" | "REASSIGN";
export const IMPACT_CODE = "ACCOUNT_HAS_IMPACT";

// Suspending: every scheduled visit from now on, plus any still-pending
// request (a "book now" request's time is already in the past). Past visits
// nobody closed stay as they are — the provider can still close them.
// Deleting: every live booking, since deleteAccount cancels them all — so
// the admin reviews exactly what will happen.
function liveBookings(userId: string, role: string, scope: "future" | "all") {
  const party = role === "PATIENT" ? { patientId: userId } : { doctorId: userId };
  const when = scope === "all"
    ? { status: { in: ["PENDING_APPROVAL", "SCHEDULED"] } }
    : { OR: [{ status: "SCHEDULED", scheduledAt: { gte: new Date() } }, { status: "PENDING_APPROVAL" }] };
  return prisma.appointment.findMany({
    where: { ...party, ...when },
    orderBy: { scheduledAt: "asc" },
    include: { patient: { select: { name: true } }, doctor: { select: { name: true } } },
  });
}

export async function accountImpact(userId: string, role: string, action: "suspend" | "delete") {
  const rows = await liveBookings(userId, role, action === "delete" ? "all" : "future");
  const wallet = role === "PATIENT"
    ? await prisma.wallet.findUnique({ where: { userId }, select: { balance: true } })
    : null;
  const bookings = rows.map((r) => ({
    ...affectedBookingSummary(r),
    providerName: r.providerType === "NURSE" ? r.doctor.name : formatDoctorName(r.doctor.name),
    consultType: r.consultType,
  }));
  return {
    rows,
    summary: {
      count: rows.length,
      refundTotal: bookings.reduce((sum, b) => sum + b.refund, 0),
      bookings,
      // Patients only: what's in their wallet now. Their bookings' refunds
      // land there too — after deletion only a manual payout can return it.
      walletBalance: wallet ? wallet.balance : null,
      canReassign: role === "DOCTOR",
    },
  };
}

// Null when the admin has confirmed this exact impact (or there's none);
// otherwise the response to send — 409 with the impact for review, or 400
// for an action this role can't take. `confirmBookingIds` must list exactly
// the bookings shown, so one made since then is reviewed, not handled unseen.
export function impactConfirmationResponse(
  impact: Awaited<ReturnType<typeof accountImpact>>,
  role: string,
  { bookingAction, confirmBookingIds }: { bookingAction?: unknown; confirmBookingIds?: unknown }
): NextResponse | null {
  const { rows, summary } = impact;
  if (bookingAction !== undefined && bookingAction !== "CANCEL" && bookingAction !== "REASSIGN") {
    return NextResponse.json({ error: "Invalid booking action" }, { status: 400 });
  }
  if (bookingAction === "REASSIGN" && role !== "DOCTOR") {
    return NextResponse.json({ error: "Only doctors' bookings can be reassigned." }, { status: 400 });
  }
  const hasImpact = rows.length > 0 || (summary.walletBalance ?? 0) > 0;
  if (!hasImpact) return null;
  const confirmed = Array.isArray(confirmBookingIds)
    && !needsBookingConfirmation(rows, confirmBookingIds)
    && (rows.length === 0 || role === "PATIENT" || bookingAction !== undefined);
  if (confirmed) return null;
  return NextResponse.json(
    {
      error: rows.length > 0
        ? "This account has upcoming bookings. Review and confirm what happens to them."
        : "This patient still has money in their wallet. Review and confirm.",
      code: IMPACT_CODE,
      impact: summary,
    },
    { status: 409 }
  );
}

const fmtWhen = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Handles a doctor's or nurse's future live bookings after they've been
// taken off the platform (suspended/rejected, or before deletion): re-reads
// them — so a booking that slipped in after the review is handled too —
// then cancels + refunds each, or reassigns it where possible, and pushes
// every patient (and each replacement doctor). One closed meanwhile is skipped.
export async function resolveProviderBookings(
  providerId: string,
  role: string,
  action: BookingAction,
  reason: "suspended" | "removed"
) {
  const rows = await liveBookings(providerId, role, "future");
  if (rows.length === 0) return { cancelled: 0, reassigned: 0, refundTotal: 0 };

  const providerName = role === "NURSE" ? rows[0].doctor.name : formatDoctorName(rows[0].doctor.name);
  const gone = `${providerName} is no longer available on DocOnClick`;
  const note = (id: string) => `Refund for appointment ${id}, cancelled because the ${role === "NURSE" ? "nurse" : "doctor"} was ${reason} by the admin`;
  const cancelledPush = (patientId: string, when: Date, refund: number) =>
    void sendPushToUser(patientId, {
      title: "Appointment cancelled",
      body: `${gone}, so your appointment on ${fmtWhen(when)} was cancelled.`
        + (refund > 0 ? ` ₹${refund} was refunded to your wallet.` : "")
        + " Please book again.",
      url: "/patient/appointments",
    });

  let cancelled = 0;
  let reassigned = 0;
  let refundTotal = 0;

  if (action === "CANCEL") {
    const results = await prisma.$transaction(
      (tx) => cancelManyAndRefund(tx, rows.map((r) => r.id), { note, skipClosed: true }),
      { timeout: 30_000 }
    );
    for (const { cancelled: row, refund } of results) {
      cancelled++;
      refundTotal += refund;
      cancelledPush(row.patientId, row.scheduledAt, refund);
    }
    return { cancelled, reassigned, refundTotal };
  }

  // One at a time, so each replacement's slot is taken before the next
  // booking looks for one.
  for (const row of rows) {
    let result;
    try {
      result = await cancelAndReassign(row, { note: note(row.id) });
    } catch (err) {
      if (err instanceof AppointmentAlreadyClosedError) continue;
      throw err;
    }
    refundTotal += result.refund;
    if (result.reassigned && result.candidate) {
      reassigned++;
      void sendPushToUser(result.candidate.id, {
        title: "New appointment request",
        body: `${row.patientName ?? row.patient.name} needs a ${row.consultType.toLowerCase()} consultation.`,
        url: "/doctor/dashboard",
      });
      void sendPushToUser(row.patientId, {
        title: "Your appointment was reassigned",
        body: `${gone}, so we've sent your ${fmtWhen(row.scheduledAt)} appointment to ${formatDoctorName(result.candidate.name)} nearby.`
          + (result.refund > 0 ? ` ₹${result.refund} was credited back to your wallet — pay again once they accept.` : ""),
        url: "/patient/appointments",
      });
    } else {
      cancelled++;
      cancelledPush(row.patientId, row.scheduledAt, result.refund);
    }
  }
  return { cancelled, reassigned, refundTotal };
}
