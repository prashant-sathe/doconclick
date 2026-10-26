// When a patient is reminded before a scheduled visit
// (PatientProfile.reminderLeadMinutes, CSV of these minutes). Client-safe (no
// Prisma) so /patient/profile/notifications and the sweep in
// src/lib/appointmentReminders.ts share it.
export const APPOINTMENT_REMINDER_LEADS = [1440, 120, 60, 30] as const;
export type ReminderLead = (typeof APPOINTMENT_REMINDER_LEADS)[number];
export const DEFAULT_REMINDER_LEADS = "60";

const isLead = (n: number): n is ReminderLead => (APPOINTMENT_REMINDER_LEADS as readonly number[]).includes(n);

/** A stored CSV → the known leads in it, largest first (unknown values are dropped). */
export function parseReminderLeads(csv: string | null | undefined): ReminderLead[] {
  const found = new Set((csv ?? "").split(",").map((p) => Number(p.trim())).filter(isLead));
  return APPOINTMENT_REMINDER_LEADS.filter((l) => found.has(l));
}

/**
 * What the profile form sent (an array of minutes, or a CSV) → the CSV to
 * store, or null when it isn't a list of known leads.
 */
export function normalizeReminderLeads(raw: unknown): string | null {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? (raw.trim() ? raw.split(",") : []) : null;
  if (!parts) return null;
  const nums = parts.map((p) => (typeof p === "number" ? p : typeof p === "string" ? Number(p.trim()) : NaN));
  if (nums.some((n) => !isLead(n))) return null;
  return parseReminderLeads(nums.join(",")).join(",");
}
