import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveDoctor } from "@/lib/doctorGuard";

// DELETE: Remove a leave/holiday date from one of the logged-in doctor's clinics
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; leaveId: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { id, leaveId } = await params;
  const leave = await prisma.clinicLeave.findUnique({
    where: { id: leaveId },
    include: { clinic: true },
  });
  if (!leave || leave.clinicId !== id || leave.clinic.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Leave date not found" }, { status: 404 });
  }

  await prisma.clinicLeave.delete({ where: { id: leaveId } });
  return NextResponse.json({ ok: true });
}
