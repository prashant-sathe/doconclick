// When a doctor may still change a consultation's prescription (medicines +
// tests), and the audit trail kept each time they do.
//
// Writable while the consultation is accepted (SCHEDULED) and for
// PRESCRIPTION_EDIT_WINDOW_HOURS after it's marked COMPLETED — long enough to
// fix a typo, short enough that a patient's issued prescription doesn't keep
// changing under them. Never on a cancelled/declined/expired consultation.

import type { Prisma } from "@/generated/prisma/client";

export const PRESCRIPTION_EDIT_WINDOW_HOURS = 24;

const STATUS_MESSAGES: Record<string, string> = {
  CANCELLED: "This consultation was cancelled, so its prescription can't be changed.",
  REJECTED: "This consultation was declined, so it can't have a prescription.",
  EXPIRED: "This request expired, so it can't have a prescription.",
  NO_SHOW: "This consultation was marked as a no-show, so it can't have a prescription.",
  PENDING_APPROVAL: "Accept the consultation before writing a prescription.",
};

/** A user-facing reason the prescription can't be edited now, or null. */
export function prescriptionEditProblem(
  appt: { status: string; completedAt: Date | null; scheduledAt: Date },
  now: Date = new Date(),
): string | null {
  if (appt.status === "SCHEDULED") return null;
  if (appt.status === "COMPLETED") {
    // Rows completed before completedAt existed fall back to the visit time.
    const since = (appt.completedAt ?? appt.scheduledAt).getTime();
    if (now.getTime() - since <= PRESCRIPTION_EDIT_WINDOW_HOURS * 60 * 60_000) return null;
    return `This prescription was issued more than ${PRESCRIPTION_EDIT_WINDOW_HOURS} hours ago and is now locked. Book a follow-up to prescribe something new.`;
  }
  return STATUS_MESSAGES[appt.status] ?? "This consultation's prescription can't be changed.";
}

type Snapshot = { medicines: Prisma.InputJsonValue[]; tests: Prisma.InputJsonValue[] };

// jsonb doesn't keep object key order, so compare with keys sorted.
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * Appends a version when `next` differs from the latest one. A prescription
 * written before history existed gets its current contents (`before`) saved
 * as version 1 first, so the original is never lost.
 */
export async function recordPrescriptionVersion(
  tx: Prisma.TransactionClient,
  params: { appointmentId: string; editedById: string; before: Snapshot; next: Snapshot },
): Promise<void> {
  const { appointmentId, editedById, before, next } = params;
  const latest = await tx.prescriptionVersion.findFirst({ where: { appointmentId }, orderBy: { version: "desc" } });
  let version = latest?.version ?? 0;
  const current = latest ? { medicines: latest.medicines, tests: latest.tests } : before;
  if (!latest && (before.medicines.length > 0 || before.tests.length > 0)) {
    await tx.prescriptionVersion.create({ data: { appointmentId, version: ++version, editedById, ...before } });
  }
  if (canonical(current) === canonical(next)) return;
  await tx.prescriptionVersion.create({ data: { appointmentId, version: version + 1, editedById, ...next } });
}
