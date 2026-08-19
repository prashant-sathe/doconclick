import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";

// GET: A patient's (or one of their family member's) profile + shared
// appointment history, visible to a doctor only if they have at least one
// appointment together (booking itself is the consent). Scoped by an
// optional `?dependentId=` — when present, both the medical-info block and
// the appointment list are restricted to that specific family member, never
// mixed with the account holder's own records or anyone else's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const authUser = await getAuthUserAny(req);
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { patientId } = await params;
  const dependentId = new URL(req.url).searchParams.get("dependentId");

  let dependent = null;
  if (dependentId) {
    dependent = await prisma.patientDependent.findUnique({
      where: { id: dependentId },
      include: { patientProfile: { select: { userId: true } } },
    });
    if (!dependent || dependent.patientProfile.userId !== patientId) {
      return NextResponse.json({ error: "Family member not found" }, { status: 404 });
    }
  }

  const sharedAppointments = await prisma.appointment.findMany({
    where: { doctorId: authUser.id, patientId, dependentId: dependentId ?? null },
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
      patientProfile: dependentId ? false : {
        select: {
          age: true,
          gender: true,
          bloodGroup: true,
          height: true,
          weight: true,
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

  return NextResponse.json({
    patient,
    dependent: dependent
      ? {
          name: dependent.name,
          relation: dependent.relation,
          age: dependent.age,
          gender: dependent.gender,
          bloodGroup: dependent.bloodGroup,
          height: dependent.height,
          weight: dependent.weight,
          allergies: dependent.allergies,
          chronicDiseases: dependent.chronicDiseases,
          medications: dependent.medications,
          surgeries: dependent.surgeries,
          emergencyContactName: dependent.emergencyContactName,
          emergencyContactPhone: dependent.emergencyContactPhone,
        }
      : null,
    // Never send the patient's visit-verification code to the doctor.
    appointments: sharedAppointments.map(({ otpCode: _otpCode, ...a }) => a),
  });
}
