// Ordering and "is this visit over?" rules for the doctor dashboard queue,
// plus its filters and patient search.
import { istDayKey, addDaysYmd } from "@/lib/istDate";

type QueueAppt = { status: string; scheduledAt: string | Date };

// A SCHEDULED visit this long past its time is treated as over but not
// closed: it drops out of "Next" and the dashboard asks for it to be marked
// complete or no-show. The grace keeps a visit that's running late from
// being flagged the moment its start time passes.
export const OVERDUE_GRACE_MS = 60 * 60 * 1000;

const time = (a: QueueAppt) => new Date(a.scheduledAt).getTime();

export function isOverdue(a: QueueAppt, now: number): boolean {
  return a.status === "SCHEDULED" && time(a) < now - OVERDUE_GRACE_MS;
}

export const byVisitAsc = (a: QueueAppt, b: QueueAppt) => time(a) - time(b);
export const byVisitDesc = (a: QueueAppt, b: QueueAppt) => time(b) - time(a);

// The soonest scheduled visit that isn't already over — never a stale one.
export function nextUpcoming<T extends QueueAppt>(appts: T[], now: number): T | undefined {
  return appts.filter((a) => a.status === "SCHEDULED" && !isOverdue(a, now)).sort(byVisitAsc)[0];
}

// ── Dashboard filters (F12) ──
// Day ranges are IST calendar days, like the rest of the dashboard.

export const QUEUE_RANGES = ["ALL", "TODAY", "TOMORROW", "WEEK"] as const;
export type QueueRange = (typeof QUEUE_RANGES)[number];
export const QUEUE_TYPES = ["ALL", "CLINIC", "VIDEO", "HOME"] as const;
export type QueueType = (typeof QUEUE_TYPES)[number];
export const QUEUE_STATUSES = ["ALL", "PENDING_APPROVAL", "SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export interface QueueFilters {
  range: QueueRange;
  type: QueueType;
  clinicId: string; // "ALL" or a clinic id
  status: QueueStatus;
}

export const DEFAULT_QUEUE_FILTERS: QueueFilters = { range: "ALL", type: "ALL", clinicId: "ALL", status: "ALL" };

export function hasActiveFilters(f: QueueFilters): boolean {
  return f.range !== "ALL" || f.type !== "ALL" || f.clinicId !== "ALL" || f.status !== "ALL";
}

type FilterAppt = QueueAppt & { consultType: string; clinicId?: string | null };

// "Next 7 days" = today and the six days after it.
export function inRange(scheduledAt: string | Date, range: QueueRange, now: Date | number): boolean {
  if (range === "ALL") return true;
  const today = istDayKey(new Date(now));
  const day = istDayKey(scheduledAt);
  if (range === "TODAY") return day === today;
  if (range === "TOMORROW") return day === addDaysYmd(today, 1);
  return day >= today && day <= addDaysYmd(today, 6); // YYYY-MM-DD compares as text
}

export function matchesQueueFilters(a: FilterAppt, f: QueueFilters, now: Date | number): boolean {
  return inRange(a.scheduledAt, f.range, now)
    && (f.type === "ALL" || a.consultType === f.type)
    && (f.clinicId === "ALL" || a.clinicId === f.clinicId)
    && (f.status === "ALL" || a.status === f.status);
}

// The last 10 digits of whatever was typed — "+91 98765 43210", "098765…" all
// search the same number.
function searchDigits(q: string): string {
  const d = q.replace(/\D/g, "").replace(/^0+/, ""); // a leading 0 is the trunk prefix
  return d.length > 10 ? d.slice(-10) : d;
}

// Name (the visit's patient or the account holder) or mobile. Digits search
// the mobile once there are three of them, so "98" doesn't match everyone.
export function matchesPatientSearch(a: { patientName?: string | null; patient: { name: string; mobile: string } }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ((a.patientName ?? "").toLowerCase().includes(q) || a.patient.name.toLowerCase().includes(q)) return true;
  const digits = searchDigits(q);
  return digits.length >= 3 && /^[\d\s+()-]+$/.test(q) && a.patient.mobile.includes(digits);
}

// tel: / WhatsApp links — only for a real 10-digit Indian mobile.
export function contactLinks(mobile: string | null | undefined): { tel: string; whatsapp: string } | null {
  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) return null;
  return { tel: `tel:+91${mobile}`, whatsapp: `https://wa.me/91${mobile}` };
}
