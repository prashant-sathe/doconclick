import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookableDoctorWhere } from "@/lib/doctorBookable";
import { PUBLIC_DOCTOR_PROFILE_SELECT, PUBLIC_CLINIC_SELECT, coarsenBase } from "@/lib/publicDoctor";
import { publicAvailability } from "@/lib/timeOff";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: List approved doctors for patient portal, optionally filtered by specialty
export const GET = withErrorLocale(async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const specialty = searchParams.get("specialty");

  const doctors = await prisma.user.findMany({
    // Ignoring case — a name typed or linked as "dentist" still finds "Dentist".
    where: bookableDoctorWhere(specialty ? { specialty: { equals: specialty, mode: "insensitive" } } : {}),
    // Public endpoint — public fields only (the doctor's own /api/doctors/me has the rest).
    select: {
      id: true,
      name: true,
      doctorProfile: { select: PUBLIC_DOCTOR_PROFILE_SELECT },
      clinics: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: PUBLIC_CLINIC_SELECT },
    },
  });
  const availability = await publicAvailability(doctors.map((d) => d.id));
  return NextResponse.json(
    doctors.map((d) => ({ ...d, doctorProfile: d.doctorProfile && coarsenBase(d.doctorProfile), ...availability(d.id) }))
  );
});
