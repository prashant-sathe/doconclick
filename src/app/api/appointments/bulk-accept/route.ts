import { NextResponse } from "next/server";
import { settleIfFreeOnAccept } from "@/lib/paymentOrders";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { doctorSlotProblem, isTimedBooking, acceptTimeProblem } from "@/lib/doctorSlots";

// POST: Accept every one of the logged-in doctor's (or their staff's) still-
// pending requests in one go — a busy morning shouldn't mean tapping "Accept"
// one at a time. Mirrors the PENDING_APPROVAL → SCHEDULED transition in
// /api/appointments/[id], including its guards: requests are accepted in
// time order, and a timed request whose time has passed, whose clinic is
// closed or on leave that day (acceptTimeProblem), or that overlaps one
// already confirmed (possibly earlier in this same batch) is left pending
// and reported back.
export async function POST() {
  const authUser = await getAuthUser();
  if (!authUser || (authUser.role !== "DOCTOR" && authUser.role !== "STAFF")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const scope = await resolveDoctorScope(authUser, { requireSubscription: true });
  if (scope.denied) return scope.denied;

  await expireStalePendingRequests();

  const pending = await prisma.appointment.findMany({
    where: { doctorId: scope.doctorId, status: "PENDING_APPROVAL" },
    select: { id: true, patientId: true, scheduledAt: true, createdAt: true, consultType: true, clinicId: true, amount: true, discountAmount: true },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });
  if (pending.length === 0) {
    return NextResponse.json({ count: 0, skipped: [] });
  }

  const accepted: typeof pending = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const a of pending) {
    const timeProblem = await acceptTimeProblem(a);
    if (timeProblem) { skipped.push({ id: a.id, reason: timeProblem }); continue; }
    if (isTimedBooking(a)) {
      const problem = await doctorSlotProblem({
        doctorId: scope.doctorId, when: a.scheduledAt, excludeAppointmentId: a.id, against: "confirmed", viewer: "doctor",
      });
      if (problem) { skipped.push({ id: a.id, reason: problem }); continue; }
    }
    // Conditional — the doctor may be answering this one individually right now.
    const { count } = await prisma.appointment.updateMany({
      where: { id: a.id, status: "PENDING_APPROVAL" },
      data: { status: "SCHEDULED", acceptedAt: new Date() },
    });
    if (count === 1) accepted.push(a);
  }

  const doctorName = authUser.role === "DOCTOR"
    ? authUser.name
    : (await prisma.user.findUnique({ where: { id: scope.doctorId }, select: { name: true } }))?.name ?? "Your doctor";
  // A ₹0 booking has no payment step — PAID as soon as it's accepted.
  const free = await settleIfFreeOnAccept(accepted);
  for (const a of accepted) {
    void sendPushToUser(a.patientId, {
      key: "apptConfirmed",
      values: { doctor: doctorName, free: free.has(a.id) ? "yes" : "no" },
      url: "/patient/appointments",
    });
  }

  return NextResponse.json({ count: accepted.length, skipped });
}
