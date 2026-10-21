import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookableDoctorWhere } from "@/lib/doctorBookable";
import { PUBLIC_DOCTOR_PROFILE_SELECT, PUBLIC_CLINIC_SELECT, coarsenBase } from "@/lib/publicDoctor";

// GET: A single doctor's public profile (unauthenticated — used by QR/profile links)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const doctor = await prisma.user.findFirst({
    where: { id, ...bookableDoctorWhere() },
    select: {
      id: true,
      name: true,
      doctorProfile: { select: PUBLIC_DOCTOR_PROFILE_SELECT },
      clinics: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: PUBLIC_CLINIC_SELECT },
    },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  return NextResponse.json({ ...doctor, doctorProfile: doctor.doctorProfile && coarsenBase(doctor.doctorProfile) });
}
