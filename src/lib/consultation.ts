import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadToS3, deleteFromS3 } from "@/lib/s3";
import { verifyUpload } from "@/lib/fileSniff";
import { recordPrescriptionVersion } from "@/lib/prescriptionLock";
import { PACKAGE_INTERVAL_OPTIONS, PACKAGE_MAX_VISITS } from "@/lib/nursePackage";
import { getBookingHorizonDays } from "@/lib/bookingLimits";
import { addDaysYmd, istDayKey, isValidYmd } from "@/lib/istDate";
import { FOLLOW_UP_NOTE_MAX, followUpInstant } from "@/lib/followUp";

// The pieces of closing a doctor's consultation — prescription items, files,
// a nurse referral and the completion guards — shared by the one-shot
// POST /api/appointments/[id]/complete and the separate routes still used to
// amend a prescription afterwards, so the rules can't drift between them.

// ── Completion guards ──

/**
 * Why this doctor consultation can't be marked COMPLETED now, or null. The
 * same rules the conditional update in completeConsultation re-checks
 * atomically (COMPLETABLE_WHERE).
 */
export function completionProblem(appt: { status: string; consultType: string; travelStatus: string; paymentMethod: string; paymentStatus: string }):
  | { error: string; code: string; status: number }
  | null {
  if (appt.status === "COMPLETED") return { error: "This consultation is already complete.", code: "ALREADY_COMPLETED", status: 409 };
  if (appt.status !== "SCHEDULED") return { error: "Only an accepted consultation can be completed.", code: "NOT_SCHEDULED", status: 409 };
  if (appt.consultType === "HOME" && appt.travelStatus !== "ARRIVED") {
    return { error: "Mark your journey as arrived before completing this home visit.", code: "NOT_ARRIVED", status: 400 };
  }
  if (appt.paymentMethod === "ONLINE" && appt.paymentStatus !== "PAID") {
    return { error: "The patient hasn't completed payment yet. You can mark this consultation complete once payment is received.", code: "UNPAID", status: 400 };
  }
  return null;
}

/** completionProblem as a where-clause, for a conditional update that loses no race. */
export const COMPLETABLE_WHERE: Prisma.AppointmentWhereInput = {
  status: "SCHEDULED",
  AND: [
    { OR: [{ consultType: { not: "HOME" } }, { travelStatus: "ARRIVED" }] },
    { OR: [{ paymentMethod: { not: "ONLINE" } }, { paymentStatus: "PAID" }] },
  ],
};

// ── Prescription items ──

export type MedicineItem = { name: string; dosage: string; frequency: string; duration: string; instructions: string | null };
export type TestItem = { name: string; instructions: string | null };

const MAX_ITEMS = 50;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Cleans a client's medicine/test lists: rows without a name are dropped. */
export function normalizePrescription(medicines: unknown, tests: unknown):
  | { medicines: MedicineItem[]; tests: TestItem[] }
  | { error: string } {
  if (medicines !== undefined && !Array.isArray(medicines)) return { error: "medicines must be an array" };
  if (tests !== undefined && !Array.isArray(tests)) return { error: "tests must be an array" };
  const meds = ((medicines ?? []) as Record<string, unknown>[])
    .filter((m) => m && typeof m.name === "string" && m.name.trim())
    .map((m) => ({
      name: str(m.name, 200),
      dosage: str(m.dosage, 100),
      frequency: str(m.frequency, 100),
      duration: str(m.duration, 100),
      instructions: str(m.instructions, 500) || null,
    }));
  const tst = ((tests ?? []) as Record<string, unknown>[])
    .filter((t) => t && typeof t.name === "string" && t.name.trim())
    .map((t) => ({ name: str(t.name, 200), instructions: str(t.instructions, 500) || null }));
  if (meds.length > MAX_ITEMS || tst.length > MAX_ITEMS) return { error: `At most ${MAX_ITEMS} medicines and ${MAX_ITEMS} tests.` };
  return { medicines: meds, tests: tst };
}

const medicineSnapshot = (m: MedicineItem) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, duration: m.duration, instructions: m.instructions });
const testSnapshot = (t: TestItem) => ({ name: t.name, instructions: t.instructions });

/** Replaces an appointment's medicines and tests, keeping a version when they change. */
export async function replacePrescription(
  tx: Prisma.TransactionClient,
  { appointmentId, editedById, medicines, tests }: { appointmentId: string; editedById: string; medicines: MedicineItem[]; tests: TestItem[] },
) {
  const [beforeMedicines, beforeTests] = await Promise.all([
    tx.prescriptionMedicine.findMany({ where: { appointmentId } }),
    tx.prescriptionTest.findMany({ where: { appointmentId } }),
  ]);
  await tx.prescriptionMedicine.deleteMany({ where: { appointmentId } });
  await tx.prescriptionMedicine.createMany({ data: medicines.map((m) => ({ appointmentId, ...m })) });
  await tx.prescriptionTest.deleteMany({ where: { appointmentId } });
  await tx.prescriptionTest.createMany({ data: tests.map((t) => ({ appointmentId, ...t })) });
  await recordPrescriptionVersion(tx, {
    appointmentId,
    editedById,
    before: { medicines: beforeMedicines.map(medicineSnapshot), tests: beforeTests.map(testSnapshot) },
    next: { medicines: medicines.map(medicineSnapshot), tests: tests.map(testSnapshot) },
  });
}

// ── Files ──

const ALLOWED_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_PRESCRIPTION_FILES = 10;
const FOLDER = "prescriptions";

export type CheckedFile = { name: string; buffer: Buffer; type: string; ext: string };

/**
 * Every file checked — type, size and its actual bytes (src/lib/fileSniff.ts)
 * — before any is uploaded, so one bad file doesn't leave the rest half-saved.
 */
export async function checkPrescriptionFiles(files: File[]): Promise<{ files: CheckedFile[] } | { error: string }> {
  if (files.length > MAX_PRESCRIPTION_FILES) return { error: `You can attach at most ${MAX_PRESCRIPTION_FILES} files at once` };
  const checked: CheckedFile[] = [];
  for (const file of files) {
    if (!ALLOWED_TYPES[file.type]) return { error: "Only PDF, JPG, or PNG files are allowed" };
    if (file.size > MAX_SIZE_BYTES) return { error: "Each file must be under 5MB" };
    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = verifyUpload(buffer, file.type, Object.keys(ALLOWED_TYPES));
    if ("error" in sniffed) return { error: `${file.name}: ${sniffed.error}` };
    checked.push({ name: file.name, buffer, type: sniffed.type, ext: sniffed.ext });
  }
  return { files: checked };
}

/** Uploads checked files; on a failure part-way, removes the ones already uploaded and rethrows. */
export async function uploadPrescriptionFiles(appointmentId: string, files: CheckedFile[]): Promise<{ url: string; fileName: string }[]> {
  const saved: { url: string; fileName: string }[] = [];
  try {
    for (const [index, f] of files.entries()) {
      const url = await uploadToS3(`${FOLDER}/${appointmentId}-${Date.now()}-${index}.${f.ext}`, f.buffer, f.type);
      saved.push({ url, fileName: f.name });
    }
  } catch (err) {
    await discardPrescriptionFiles(saved);
    throw err;
  }
  return saved;
}

export const discardPrescriptionFiles = (saved: { url: string }[]) => Promise.all(saved.map((s) => deleteFromS3(s.url, FOLDER)));

// ── Nurse referral ──

export type ReferralInput = { serviceId: string; serviceName: string; visits: number; intervalDays: number; instructions: string | null };

/** Validates { serviceId, visits, intervalDays, instructions } against active nurse services. */
export async function parseReferral(body: Record<string, unknown>): Promise<ReferralInput | { error: string }> {
  const visits = Number(body.visits ?? 1);
  const intervalDays = Number(body.intervalDays ?? 1);
  if (!Number.isInteger(visits) || visits < 1 || visits > PACKAGE_MAX_VISITS) return { error: `Visits must be between 1 and ${PACKAGE_MAX_VISITS}.` };
  if (!(PACKAGE_INTERVAL_OPTIONS as readonly number[]).includes(intervalDays)) return { error: "Visits can be every 1, 2 or 3 days." };
  const service = await prisma.nurseService.findFirst({ where: { id: String(body.serviceId ?? ""), isActive: true }, select: { id: true, name: true } });
  if (!service) return { error: "Pick a nurse service." };
  const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, 1000) || null : null;
  return { serviceId: service.id, serviceName: service.name, visits, intervalDays, instructions };
}

// ── Follow-up ──

export type FollowUpInput = { followUpDate: Date | null; followUpNote: string | null };

/**
 * Validates { date: "YYYY-MM-DD" (IST day), note? } — or null to clear. The
 * day must be after today (IST) and within the booking horizon, so the
 * patient can actually book it.
 */
export async function parseFollowUp(raw: unknown, now: Date = new Date()): Promise<FollowUpInput | { error: string; code: string }> {
  if (raw === null) return { followUpDate: null, followUpNote: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "Invalid follow-up.", code: "INVALID_FOLLOW_UP" };
  const { date, note } = raw as Record<string, unknown>;
  if (typeof date !== "string" || !isValidYmd(date)) return { error: "Pick a valid follow-up date.", code: "INVALID_FOLLOW_UP" };
  const today = istDayKey(now);
  if (date <= today) return { error: "The follow-up date must be after today.", code: "INVALID_FOLLOW_UP" };
  const horizon = await getBookingHorizonDays();
  if (date > addDaysYmd(today, horizon)) {
    return { error: `The follow-up can be at most ${horizon} days ahead.`, code: "INVALID_FOLLOW_UP" };
  }
  if (note !== undefined && note !== null && typeof note !== "string") return { error: "The follow-up note must be text.", code: "INVALID_FOLLOW_UP" };
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > FOLLOW_UP_NOTE_MAX) {
    return { error: `Keep the follow-up note under ${FOLLOW_UP_NOTE_MAX} characters.`, code: "INVALID_FOLLOW_UP" };
  }
  return { followUpDate: followUpInstant(date), followUpNote: text || null };
}

export const NOTES_MAX = 5000;

export const badRequest = (error: string, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status: 400 });
