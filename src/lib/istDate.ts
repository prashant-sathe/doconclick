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
