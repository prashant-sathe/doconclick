import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET ?patientId=…&dependentId=… — vitals history for one person (the
// account holder, or one family member — never mixed).
// Patient: their own and their family members'. Doctor / nurse: only for a
// person they've had a visit with (booking is the consent, same rule as the
// doctor's patient-history page).
export async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const patientId = authUser.role === "PATIENT" ? authUser.id : sp.get("patientId");
  const dependentId = sp.get("dependentId") || null;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  if (dependentId) {
    const dep = await prisma.patientDependent.findUnique({
      where: { id: dependentId },
      select: { patientProfile: { select: { userId: true } } },
    });
    if (!dep || dep.patientProfile.userId !== patientId) {
      return NextResponse.json({ error: "Family member not found" }, { status: 404 });
    }
  }

  if (authUser.role === "DOCTOR" || authUser.role === "NURSE") {
    const shared = await prisma.appointment.count({
      where: { doctorId: authUser.id, patientId, dependentId, status: { notIn: ["REJECTED", "EXPIRED"] } },
    });
    if (shared === 0) return NextResponse.json({ error: "You have no visits with this patient" }, { status: 403 });
  } else if (authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const take = Math.min(200, Math.max(1, Number(sp.get("limit")) || 60));
  const readings = await prisma.vitalReading.findMany({
    where: { patientId, dependentId },
    orderBy: { recordedAt: "desc" },
    take,
    include: { recordedBy: { select: { name: true } }, appointment: { select: { serviceName: true } } },
  });
  return NextResponse.json(readings);
}
