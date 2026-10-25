// A doctor's prescription shortcuts — favourite medicines and named templates
// (DoctorFavouriteMedicine / PrescriptionTemplate) — and the "repeat last
// prescription" lookup. Shortcuts only fill the editor; the prescription is
// still saved by the routes that enforce src/lib/prescriptionLock.ts.

import { prisma } from "@/lib/prisma";
import { normalizePrescription, type MedicineItem, type TestItem } from "@/lib/consultation";

export const MAX_FAVOURITE_MEDICINES = 200;
export const MAX_PRESCRIPTION_TEMPLATES = 50;
export const TEMPLATE_NAME_MAX = 60;

/** A favourite from a client body: the cleaned medicine row, or why it's rejected. */
export function normalizeFavourite(body: Record<string, unknown>): { item: MedicineItem } | { error: string } {
  const cleaned = normalizePrescription([body], []);
  if ("error" in cleaned) return cleaned;
  const item = cleaned.medicines[0];
  if (!item) return { error: "Enter the medicine name." };
  return { item };
}

/** A template from a client body: its name and cleaned lists, or why it's rejected. */
export function normalizeTemplate(body: Record<string, unknown>):
  | { name: string; medicines: MedicineItem[]; tests: TestItem[] }
  | { error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "Give the template a name." };
  if (name.length > TEMPLATE_NAME_MAX) return { error: `Keep the template name under ${TEMPLATE_NAME_MAX} characters.` };
  if (!Array.isArray(body.medicines) && !Array.isArray(body.tests)) return { error: "Add a medicine or a test to save as a template." };
  const items = normalizePrescription(body.medicines ?? [], body.tests ?? []);
  if ("error" in items) return items;
  if (items.medicines.length === 0 && items.tests.length === 0) return { error: "Add a medicine or a test to save as a template." };
  return { name, ...items };
}

export const nameKeyOf = (name: string) => name.trim().toLowerCase();

/**
 * The doctor's most recent earlier prescription for the same person (account
 * holder, or one family member — never mixed) on a completed visit, or null.
 */
export async function lastPrescriptionFor(params: { doctorId: string; patientId: string; dependentId: string | null; excludeAppointmentId: string }) {
  const { doctorId, patientId, dependentId, excludeAppointmentId } = params;
  const prev = await prisma.appointment.findFirst({
    where: {
      doctorId, patientId, dependentId, status: "COMPLETED", id: { not: excludeAppointmentId },
      OR: [{ medicines: { some: {} } }, { tests: { some: {} } }],
    },
    orderBy: [{ scheduledAt: "desc" }],
    select: {
      id: true, scheduledAt: true, completedAt: true,
      medicines: { select: { name: true, dosage: true, frequency: true, duration: true, instructions: true }, orderBy: { id: "asc" } },
      tests: { select: { name: true, instructions: true }, orderBy: { id: "asc" } },
    },
  });
  if (!prev) return null;
  return { appointmentId: prev.id, date: (prev.completedAt ?? prev.scheduledAt).toISOString(), medicines: prev.medicines, tests: prev.tests };
}
