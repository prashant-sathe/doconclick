import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;

// GET: The patient fetches structured prescription data for their own completed appointment
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
      patient: { select: { name: true, patientProfile: { select: { age: true, gender: true } } } },
      doctor: { select: { name: true, doctorProfile: { select: { qualification: true, medRegNo: true, specialty: true } } } },
      medicines: true,
    },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (authUser.id !== appointment.patientId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (appointment.status !== "COMPLETED") {
    return NextResponse.json({ error: "Prescription not available yet" }, { status: 400 });
  }

  return NextResponse.json({
    id: appointment.id,
    scheduledAt: appointment.scheduledAt,
    patientName: appointment.patientName,
    accountHolderName: appointment.patient.name,
    relation: appointment.relation,
    patientAge: appointment.patient.patientProfile?.age ?? null,
    patientGender: appointment.patient.patientProfile?.gender ?? null,
    doctorName: appointment.doctor.name,
    doctorQualification: appointment.doctor.doctorProfile?.qualification ?? null,
    doctorRegNo: appointment.doctor.doctorProfile?.medRegNo ?? null,
    doctorSpecialty: appointment.doctor.doctorProfile?.specialty ?? "General Physician",
    doctorNotes: appointment.doctorNotes,
    medicines: appointment.medicines.map((m) => ({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
    })),
  });
}

// POST: Doctor uploads one or more prescription files (reports/scans) for their own appointment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `You can attach at most ${MAX_FILES} files at once` }, { status: 400 });
  }
  for (const file of files) {
    if (!ALLOWED_TYPES[file.type]) {
      return NextResponse.json({ error: "Only PDF, JPG, or PNG files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Each file must be under 5MB" }, { status: 400 });
    }
  }

  const dir = path.join(process.cwd(), "public", "uploads", "prescriptions");
  await mkdir(dir, { recursive: true });

  const saved: { url: string; fileName: string }[] = [];
  for (const [index, file] of files.entries()) {
    const ext = ALLOWED_TYPES[file.type];
    const filename = `${id}-${Date.now()}-${index}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);
    saved.push({ url: `/uploads/prescriptions/${filename}`, fileName: file.name });
  }

  await prisma.prescriptionAttachment.createMany({
    data: saved.map((s) => ({ appointmentId: id, url: s.url, fileName: s.fileName })),
  });

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: appointment.status === "SCHEDULED" ? "COMPLETED" : appointment.status,
      ...(appointment.paymentMethod === "CASH" ? { paymentStatus: "PAID" } : {}),
    },
    include: { attachments: true },
  });

  return NextResponse.json(updated);
}
