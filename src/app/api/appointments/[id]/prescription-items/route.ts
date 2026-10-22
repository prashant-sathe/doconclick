import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { requireRole, readJson } from "@/lib/routeGuards";
import { prescriptionEditProblem } from "@/lib/prescriptionLock";
import { normalizePrescription, replacePrescription } from "@/lib/consultation";

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
  if (!Array.isArray(body.medicines)) {
    return NextResponse.json({ error: "medicines must be an array" }, { status: 400 });
  }
  const items = normalizePrescription(body.medicines, body.tests);
  if ("error" in items) return NextResponse.json({ error: items.error }, { status: 400 });

  await prisma.$transaction((tx) => replacePrescription(tx, { appointmentId: id, editedById: authUser.id, ...items }));

  const [resultMedicines, resultTests] = await Promise.all([
    prisma.prescriptionMedicine.findMany({ where: { appointmentId: id } }),
    prisma.prescriptionTest.findMany({ where: { appointmentId: id } }),
  ]);
  return NextResponse.json({ medicines: resultMedicines, tests: resultTests });
}
