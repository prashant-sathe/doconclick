import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { checkPrescriptionFiles, uploadPrescriptionFiles, discardPrescriptionFiles } from "@/lib/consultation";
import { requireActiveDoctor } from "@/lib/doctorGuard";

// GET: Structured prescription data for PrescriptionDocument — for the
// patient and the doctor who wrote it (once the consultation is completed),
// and for admins (any status, e.g. reviewing a disputed booking).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { name: true, patientProfile: { select: { age: true, gender: true, homeAddress: true } } } },
      dependent: { select: { age: true, gender: true } },
      doctor: { select: { name: true, doctorProfile: { select: { qualification: true, medRegNo: true, specialty: true, clinicName: true, signatureUrl: true } } } },
      medicines: true,
      tests: true,
    },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.providerType === "NURSE") {
    return NextResponse.json({ error: "Nurse visits don't have a prescription." }, { status: 404 });
  }
  const isAdmin = authUser.role === "ADMIN";
  const isOwnDoctor = authUser.role === "DOCTOR" && authUser.id === appointment.doctorId;
  if (!isAdmin && !isOwnDoctor && authUser.id !== appointment.patientId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!isAdmin && appointment.status !== "COMPLETED") {
    return NextResponse.json({ error: "Prescription not available yet" }, { status: 400 });
  }

  // A family member's prescription carries their own age/gender — never the
  // account holder's. Dependents have no saved address of their own.
  const forDependent = !!appointment.dependentId;
  const profile = appointment.patient.patientProfile;

  return NextResponse.json({
    id: appointment.id,
    scheduledAt: appointment.scheduledAt,
    patientName: appointment.patientName,
    accountHolderName: appointment.patient.name,
    relation: appointment.relation,
    patientAge: (forDependent ? appointment.dependent?.age : profile?.age) ?? null,
    patientGender: (forDependent ? appointment.dependent?.gender : profile?.gender) ?? null,
    patientAddress: forDependent ? null : profile?.homeAddress ?? null,
    doctorName: appointment.doctor.name,
    doctorQualification: appointment.doctor.doctorProfile?.qualification ?? null,
    doctorRegNo: appointment.doctor.doctorProfile?.medRegNo ?? null,
    doctorSpecialty: appointment.doctor.doctorProfile?.specialty ?? "General Physician",
    clinicName: appointment.doctor.doctorProfile?.clinicName ?? null,
    doctorNotes: appointment.doctorNotes,
    doctorSignatureUrl: appointment.doctor.doctorProfile?.signatureUrl ?? null,
    medicines: appointment.medicines.map((m) => ({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
    })),
    tests: appointment.tests.map((t) => ({
      name: t.name,
      instructions: t.instructions,
    })),
  });
}

// POST: Doctor uploads one or more prescription files (reports/scans) for their own appointment.
// Attach-only: closing the consultation (and its payment/arrival guards) is the
// PATCH /api/appointments/[id] handler's job, never this route's.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status !== "SCHEDULED" && appointment.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Files can only be attached to an accepted or completed consultation." },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const checked = await checkPrescriptionFiles(files);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

  const saved = await uploadPrescriptionFiles(id, checked.files);
  try {
    await prisma.prescriptionAttachment.createMany({
      data: saved.map((s) => ({ appointmentId: id, url: s.url, fileName: s.fileName })),
    });
  } catch (err) {
    await discardPrescriptionFiles(saved);
    throw err;
  }

  const attachments = await prisma.prescriptionAttachment.findMany({ where: { appointmentId: id } });
  return NextResponse.json({ attachments });
}
