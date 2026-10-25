// Follow-up a doctor suggests when completing a consultation ("review in N
// days"). Client-safe (no Prisma) so the completion form and the patient's
// card share it; the server rules live in parseFollowUp (src/lib/consultation.ts).
import { addDaysYmd, istDayKey, istStartOfDay } from "@/lib/istDate";

/** Quick picks on the completion form, in days from today. */
export const FOLLOW_UP_CHIPS = [3, 7, 14, 30] as const;
export const FOLLOW_UP_NOTE_MAX = 200;

/** Today's IST date + `days`, as YYYY-MM-DD. */
export function followUpYmdIn(days: number, now: Date = new Date()): string {
  return addDaysYmd(istDayKey(now), days);
}

/** The stored instant for a follow-up day (its first instant, IST). */
export const followUpInstant = (ymd: string) => istStartOfDay(ymd);

/** "Mon, 3 Nov" style label for a stored follow-up date, read as an IST day. */
export function followUpLabel(date: Date | string, locale: string): string {
  return new Date(date).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
