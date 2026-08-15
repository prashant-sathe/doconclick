import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: A patient's profile + shared appointment history, visible to a doctor only
// if they have at least one appointment together (booking itself is the consent).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { patientId } = await params;

  const sharedAppointments = await prisma.appointment.findMany({
    where: { doctorId: authUser.id, patientId },
    orderBy: { scheduledAt: "desc" },
    include: { medicines: true, attachments: true, review: true },
  });

  if (sharedAppointments.length === 0) {
    return NextResponse.json({ error: "You have no appointment history with this patient" }, { status: 403 });
  }

  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      name: true,
      mobile: true,
      patientProfile: {
        select: {
          age: true,
          gender: true,
          bloodGroup: true,
          allergies: true,
          chronicDiseases: true,
          medications: true,
          surgeries: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
        },
      },
    },
  });

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  return NextResponse.json({ patient, appointments: sharedAppointments });
}
