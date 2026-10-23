import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { todayIsoDateIst } from "@/lib/clinicAvailability";
import {
  cancelManyAndRefund, isAlreadyClosed, isTransientConflict, LIVE_STATUSES,
  needsBookingConfirmation, affectedBookingSummary, BOOKINGS_CHANGED_MESSAGE,
} from "@/lib/appointmentCancel";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { formatDoctorName } from "@/lib/utils";
import { withErrorLocale } from "@/lib/apiErrors";

async function loadOwnedClinic(doctorId: string, id: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic || clinic.doctorId !== doctorId || clinic.deletedAt) return null;
  return clinic;
}

// GET: List upcoming/all leave dates for one of the logged-in doctor's clinics
export const GET = withErrorLocale(async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const clinic = await loadOwnedClinic(authUser.id, id);
  if (!clinic) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  const leaves = await prisma.clinicLeave.findMany({
    where: { clinicId: id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ leaves });
});

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS_AHEAD = 365;
const MAX_REASON_LENGTH = 200;

// "YYYY-MM-DD" → that calendar day's bounds in IST, or null for anything
// that isn't a real date (2026-02-31, 2026-13-01, …).
function istDayBounds(date: unknown): { start: Date; end: Date } | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  if (new Date(utcMidnight).toISOString().slice(0, 10) !== date) return null;
  const start = new Date(utcMidnight - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}


// POST { date, reason?, confirmBookingIds? }: mark a leave day for one of the
// logged-in doctor's clinics. The date must be real and today or later (IST).
// If live bookings at this clinic fall on that day, the first call returns
// 409 LEAVE_HAS_BOOKINGS with the list so the doctor can confirm; repeating
// it with exactly those ids adds the leave and cancels them — each refunded
// to the patient's wallet (or its coupon slot freed) through the shared
// cancel path, and each patient pushed. A booking that appears in between
// re-triggers the confirmation instead of being cancelled unseen.
export const POST = withErrorLocale(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser, { requireSubscription: true });
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const clinic = await loadOwnedClinic(authUser.id, id);
  if (!clinic) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  const { date, reason: rawReason, confirmBookingIds } = await req.json().catch(() => ({}));
  const day = istDayBounds(date);
  if (!day) {
    return NextResponse.json({ error: "Pick a valid date." }, { status: 400 });
  }
  const today = todayIsoDateIst();
  if (date < today) {
    return NextResponse.json({ error: "Leave can't be added for a date that has already passed." }, { status: 400 });
  }
  if (day.start.getTime() > istDayBounds(today)!.start.getTime() + MAX_DAYS_AHEAD * DAY_MS) {
    return NextResponse.json({ error: `Leave can be added up to ${MAX_DAYS_AHEAD} days ahead.` }, { status: 400 });
  }
  const reason = typeof rawReason === "string" && rawReason.trim() ? rawReason.trim() : null;
  if (reason && reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json({ error: `Keep the reason under ${MAX_REASON_LENGTH} characters.` }, { status: 400 });
  }
  if (await prisma.clinicLeave.findUnique({ where: { clinicId_date: { clinicId: id, date } } })) {
    return NextResponse.json({ error: "That date is already marked as a leave day." }, { status: 409 });
  }

  const affected = await prisma.appointment.findMany({
    where: { clinicId: id, status: { in: LIVE_STATUSES }, scheduledAt: { gte: day.start, lt: day.end } },
    orderBy: { scheduledAt: "asc" },
    include: { patient: { select: { name: true } } },
  });
  if (needsBookingConfirmation(affected, confirmBookingIds)) {
    return NextResponse.json(
      {
        error: "Some patients are booked at this clinic that day. Confirm to cancel and refund them.",
        code: "LEAVE_HAS_BOOKINGS",
        bookings: affected.map(affectedBookingSummary),
      },
      { status: 409 }
    );
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const leave = await tx.clinicLeave.create({ data: { clinicId: id, date, reason } });
      const cancelled = await cancelManyAndRefund(tx, affected.map((a) => a.id), {
        data: { doctorNotes: `Cancelled: clinic closed on ${date}${reason ? ` (${reason})` : ""}` },
        note: (apptId) => `Refund for appointment ${apptId}, cancelled for the doctor's leave on ${date}`,
      });
      return { leave, cancelled };
    }, { timeout: 30_000 });
  } catch (err) {
    // A concurrent add of the same date, or a booking that changed in the
    // meantime — the transaction rolled back, so nothing was written.
    if (!isAlreadyClosed(err) && !isTransientConflict(err)) throw err;
    if (await prisma.clinicLeave.findUnique({ where: { clinicId_date: { clinicId: id, date } } })) {
      return NextResponse.json({ error: "That date is already marked as a leave day." }, { status: 409 });
    }
    return NextResponse.json({ error: BOOKINGS_CHANGED_MESSAGE }, { status: 409 });
  }

  const doctorName = formatDoctorName(authUser.name);
  for (const { cancelled, refund } of result.cancelled) {
    void sendPushToUser(cancelled.patientId, {
      key: "apptCancelledClinicLeave",
      values: {
        doctor: doctorName,
        clinic: clinic.name,
        when: cancelled.scheduledAt,
        hasReason: reason ? "yes" : "no",
        reason: reason ?? "",
        refunded: refund > 0 ? "yes" : "no",
        amount: refund,
      },
      url: "/patient/appointments",
    });
  }

  return NextResponse.json({
    ...result.leave,
    cancelledBookings: result.cancelled.length,
    refundTotal: result.cancelled.reduce((sum, c) => sum + c.refund, 0),
  });
});
