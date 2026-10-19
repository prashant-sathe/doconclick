import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { requireRole, readJson } from "@/lib/routeGuards";
import { prescriptionEditProblem, recordPrescriptionVersion } from "@/lib/prescriptionLock";

interface MedicineInput {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

interface TestInput {
  name: string;
  instructions?: string;
}

// The stored shape of one medicine / test — what a version snapshots.
const medicineSnapshot = (m: { name: string; dosage: string; frequency: string; duration: string; instructions: string | null }) =>
  ({ name: m.name, dosage: m.dosage, frequency: m.frequency, duration: m.duration, instructions: m.instructions });
const testSnapshot = (t: { name: string; instructions: string | null }) => ({ name: t.name, instructions: t.instructions });

// GET: the prescription's version history, newest first — for the doctor who
// wrote it and for admins.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("DOCTOR", "ADMIN");
  if (denied) return denied;

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id }, select: { doctorId: true } });
  if (!appointment || (authUser.role === "DOCTOR" && appointment.doctorId !== authUser.id)) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  const versions = await prisma.prescriptionVersion.findMany({ where: { appointmentId: id }, orderBy: { version: "desc" } });
  return NextResponse.json({ versions });
}

// POST: Doctor replaces the medicine/test list for their own appointment —
// only while it's accepted or within the edit window after completion
// (src/lib/prescriptionLock.ts). Every change is kept as a version.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return denied;
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  const locked = prescriptionEditProblem(appointment);
  if (locked) return NextResponse.json({ error: locked, code: "PRESCRIPTION_LOCKED" }, { status: 409 });

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const { medicines, tests } = body;
  if (!Array.isArray(medicines)) {
    return NextResponse.json({ error: "medicines must be an array" }, { status: 400 });
  }
  if (tests !== undefined && !Array.isArray(tests)) {
    return NextResponse.json({ error: "tests must be an array" }, { status: 400 });
  }

  const validMedicines: MedicineInput[] = medicines.filter(
    (m): m is MedicineInput => m && typeof m.name === "string" && m.name.trim().length > 0
  );
  const validTests: TestInput[] = ((tests ?? []) as unknown[]).filter(
    (t): t is TestInput => !!t && typeof (t as TestInput).name === "string" && (t as TestInput).name.trim().length > 0
  );
  const nextMedicines = validMedicines.map((m) => ({
    name: m.name.trim(),
    dosage: m.dosage || "",
    frequency: m.frequency || "",
    duration: m.duration || "",
    instructions: m.instructions || null,
  }));
  const nextTests = validTests.map((t) => ({ name: t.name.trim(), instructions: t.instructions || null }));

  await prisma.$transaction(async (tx) => {
    const [beforeMedicines, beforeTests] = await Promise.all([
      tx.prescriptionMedicine.findMany({ where: { appointmentId: id } }),
      tx.prescriptionTest.findMany({ where: { appointmentId: id } }),
    ]);
    await tx.prescriptionMedicine.deleteMany({ where: { appointmentId: id } });
    await tx.prescriptionMedicine.createMany({ data: nextMedicines.map((m) => ({ appointmentId: id, ...m })) });
    await tx.prescriptionTest.deleteMany({ where: { appointmentId: id } });
    await tx.prescriptionTest.createMany({ data: nextTests.map((t) => ({ appointmentId: id, ...t })) });
    await recordPrescriptionVersion(tx, {
      appointmentId: id,
      editedById: authUser.id,
      before: { medicines: beforeMedicines.map(medicineSnapshot), tests: beforeTests.map(testSnapshot) },
      next: { medicines: nextMedicines, tests: nextTests },
    });
  });

  const [resultMedicines, resultTests] = await Promise.all([
    prisma.prescriptionMedicine.findMany({ where: { appointmentId: id } }),
    prisma.prescriptionTest.findMany({ where: { appointmentId: id } }),
  ]);
  return NextResponse.json({ medicines: resultMedicines, tests: resultTests });
}
