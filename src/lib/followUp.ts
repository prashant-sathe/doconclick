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

/**
 * "Mon, 3 Nov 2026" style label for a stored follow-up date, read as an IST
 * day. Built from parts: ICU's own mr / en patterns put a stray comma after
 * the day ("रवि, 1, नोव्हें 2026"), so the order and separators are fixed here.
 */
export function followUpLabel(date: Date | string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    .formatToParts(new Date(date));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")}`;
}

/**
 * The one-tap rebook link for a past visit: the same doctor, clinic and
 * consult type, as a follow-up of it — the patient still picks the slot and pays.
 */
export function followUpBookHref(a: { id: string; doctorId: string; consultType: string; clinicId?: string | null }): string {
  return `/patient/book?${new URLSearchParams({
    doctorId: a.doctorId, followUpOf: a.id, consultType: a.consultType, ...(a.clinicId ? { clinicId: a.clinicId } : {}),
  })}`;
}
