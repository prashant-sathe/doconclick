// Calendar days as India sees them (Asia/Kolkata, UTC+05:30, no DST). Reports
// are read by people in IST: "1 Oct to 31 Oct" means those IST days, and a
// payment at 11:45 pm IST on the 31st belongs to the 31st — not to the 1st,
// which is what a UTC day key makes of it. Client-safe (no Prisma).

const IST = "Asia/Kolkata";
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `s` is a real calendar date written YYYY-MM-DD (so 2026-02-31 is not). */
export function isValidYmd(s: string): boolean {
  const m = YMD.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** The IST calendar day (YYYY-MM-DD) an instant falls on. */
export function istDayKey(instant: Date | string): string {
  return new Date(instant).toLocaleDateString("en-CA", { timeZone: IST });
}

/** The first instant of an IST day. */
export function istStartOfDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+05:30`);
}

/** The last instant of an IST day. */
export function istEndOfDay(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

// ── Months, weeks and time of day (IST) ──
// "This month", "today" and the weekday bars are the doctor's calendar, not the
// device's or the server's: a 11:45 pm IST payment on the 31st is that month's.

const parseYmd = (ymd: string) => ymd.split("-").map(Number) as [number, number, number];

/** The IST month (YYYY-MM) an instant falls in. */
export function istMonthKey(instant: Date | string): string {
  return istDayKey(instant).slice(0, 7);
}

/** `ym` (YYYY-MM) moved by `delta` months. */
export function shiftMonthKey(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The first instant of an IST month. */
export function istStartOfMonth(ym: string): Date {
  return istStartOfDay(`${ym}-01`);
}

/** "Oct" for 2026-10 — a month name needs no timezone, so it's read in UTC from the bare date. */
export function monthShortLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
}

/** A YYYY-MM-DD date moved by `days`. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday, for a YYYY-MM-DD date. */
export function mondayIndex(ymd: string): number {
  const [y, m, d] = parseYmd(ymd);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** "Mon" for a YYYY-MM-DD date. */
export function weekdayShortLabel(ymd: string): string {
  const [y, m, d] = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
}

/** Minutes since midnight, IST, for an instant. */
export function istMinutesOfDay(instant: Date | string | number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}
