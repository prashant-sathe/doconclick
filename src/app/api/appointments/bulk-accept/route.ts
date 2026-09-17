import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { sendPushToUser } from "@/lib/firebaseAdmin";

// POST: Accept every one of the logged-in doctor's (or their staff's) still-
// pending requests in one go — a busy morning shouldn't mean tapping "Accept"
// one at a time. Mirrors the PENDING_APPROVAL → SCHEDULED transition in
// /api/appointments/[id] (no extra guard applies to that transition there
// either — home-visit distance etc. is checked at booking time, not
// acceptance time), just applied to every pending request instead of one.
export async function POST() {
  const authUser = await getAuthUser();
  if (!authUser || (authUser.role !== "DOCTOR" && authUser.role !== "STAFF")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const scope = await resolveDoctorScope(authUser);
  if (scope.denied) return scope.denied;

  await expireStalePendingRequests();

  const pending = await prisma.appointment.findMany({
    where: { doctorId: scope.doctorId, status: "PENDING_APPROVAL" },
    select: { id: true, patientId: true },
  });
  if (pending.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  await prisma.appointment.updateMany({
    where: { id: { in: pending.map((a) => a.id) } },
    data: { status: "SCHEDULED", acceptedAt: new Date() },
  });

  const doctorName = authUser.role === "DOCTOR"
    ? authUser.name
    : (await prisma.user.findUnique({ where: { id: scope.doctorId }, select: { name: true } }))?.name ?? "Your doctor";
  for (const a of pending) {
    void sendPushToUser(a.patientId, {
      title: "Appointment confirmed!",
      body: `${doctorName} accepted your request.`,
      url: "/patient/appointments",
    });
  }

  return NextResponse.json({ count: pending.length });
}
