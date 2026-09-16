import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { sendPushToUser } from "@/lib/firebaseAdmin";

// POST: Accept every one of the logged-in doctor's still-pending requests in
// one go — a busy morning shouldn't mean tapping "Accept" one at a time.
// Mirrors the PENDING_APPROVAL → SCHEDULED transition in
// /api/appointments/[id] (no extra guard applies to that transition there
// either — home-visit distance etc. is checked at booking time, not
// acceptance time), just applied to every pending request instead of one.
export async function POST() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  await expireStalePendingRequests();

  const pending = await prisma.appointment.findMany({
    where: { doctorId: authUser.id, status: "PENDING_APPROVAL" },
    select: { id: true, patientId: true },
  });
  if (pending.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  await prisma.appointment.updateMany({
    where: { id: { in: pending.map((a) => a.id) } },
    data: { status: "SCHEDULED", acceptedAt: new Date() },
  });

  for (const a of pending) {
    void sendPushToUser(a.patientId, {
      title: "Appointment confirmed!",
      body: `${authUser.name} accepted your request.`,
      url: "/patient/appointments",
    });
  }

  return NextResponse.json({ count: pending.length });
}
