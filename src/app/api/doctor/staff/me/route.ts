import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: the logged-in staff account's own assignment — used by the dashboard
// bootstrap in place of the doctor-only /api/doctors/me check.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "STAFF") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const staffProfile = await prisma.staffProfile.findUnique({
    where: { userId: authUser.id },
    include: { doctor: { select: { name: true } } },
  });
  if (!staffProfile) {
    return NextResponse.json({ error: "Staff account not found" }, { status: 404 });
  }

  return NextResponse.json({
    active: staffProfile.active,
    doctorId: staffProfile.doctorId,
    doctorName: staffProfile.doctor.name,
  });
}
