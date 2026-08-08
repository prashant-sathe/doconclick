import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: The logged-in user's own appointments (as patient or as doctor)
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (authUser.role === "PATIENT") {
    const appointments = await prisma.appointment.findMany({
      where: { patientId: authUser.id },
      orderBy: { scheduledAt: "desc" },
      include: {
        doctor: { select: { name: true, doctorProfile: { select: { specialty: true, photoUrl: true } } } },
        review: true,
        medicines: true,
      },
    });
    return NextResponse.json(appointments);
  }

  if (authUser.role === "DOCTOR") {
    const appointments = await prisma.appointment.findMany({
      where: { doctorId: authUser.id },
      orderBy: [{ isEmergency: "desc" }, { scheduledAt: "asc" }],
      include: {
        patient: {
          select: {
            name: true,
            mobile: true,
            patientProfile: { select: { lat: true, lng: true, homeAddress: true } },
          },
        },
      },
    });
    return NextResponse.json(appointments);
  }

  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
}
