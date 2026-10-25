import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/routeGuards";
import { prescriptionEditProblem } from "@/lib/prescriptionLock";
import { careAccessProblem } from "@/lib/careAccess";
import { lastPrescriptionFor } from "@/lib/prescriptionKit";
import { allergyTerms } from "@/lib/medicineCatalog";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: what the prescription editor needs about this patient — their known
// allergies (for the advisory warning, src/lib/medicineCatalog.ts) and the
// doctor's own last prescription for them ("repeat last"). The doctor of this
// appointment only (never staff), only while its prescription is editable.
// The allergies given at booking are always included (the visit card shows
// them already); the profile's current allergies and the past prescription
// follow the patient-history rule (src/lib/careAccess.ts), so a desk-booked
// walk-in doesn't open them.
export const GET = withErrorLocale(async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return denied;

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    select: { id: true, doctorId: true, patientId: true, dependentId: true, status: true, completedAt: true, scheduledAt: true, allergies: true },
  });
  if (!appointment || appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  const locked = prescriptionEditProblem(appointment);
  if (locked) return NextResponse.json({ error: locked, code: "PRESCRIPTION_LOCKED" }, { status: 409 });

  const { patientId, dependentId } = appointment;
  const history = !(await careAccessProblem({ providerId: authUser.id, patientId, dependentId }));

  let profileAllergies: string | null = null;
  let lastPrescription = null;
  if (history) {
    profileAllergies = dependentId
      ? (await prisma.patientDependent.findUnique({ where: { id: dependentId }, select: { allergies: true } }))?.allergies ?? null
      : (await prisma.patientProfile.findUnique({ where: { userId: patientId }, select: { allergies: true } }))?.allergies ?? null;
    lastPrescription = await lastPrescriptionFor({ doctorId: authUser.id, patientId, dependentId, excludeAppointmentId: id });
  }

  return NextResponse.json({
    allergies: allergyTerms(appointment.allergies, profileAllergies),
    lastPrescription,
  });
});
