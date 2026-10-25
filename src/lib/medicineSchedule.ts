// Medicine reminders (FP1-22): reading a prescribed medicine's frequency and
// duration into dose times and a number of days. Client-safe (no Prisma) so
// the patient's /patient/profile/medicines picker shares the same rules as the
// server (src/lib/medicineReminders.ts).

/** No dose push between 22:00 and 06:00 IST — dose times must fall outside it. */
export const QUIET_START_MIN = 22 * 60;
export const QUIET_END_MIN = 6 * 60;

/** The picker's quick slots, and what a parsed "1-0-1" / "BD" / "TDS" turns into. */
export const DOSE_SLOTS = { morning: "08:00", afternoon: "14:00", evening: "18:00", night: "21:00" } as const;
export type DoseSlot = keyof typeof DOSE_SLOTS;

export const MAX_DOSES_PER_DAY = 6;
export const MAX_COURSE_DAYS = 90;

const ONE = [DOSE_SLOTS.morning];
const TWO = [DOSE_SLOTS.morning, DOSE_SLOTS.night];
const THREE = [DOSE_SLOTS.morning, DOSE_SLOTS.afternoon, DOSE_SLOTS.night];
const FOUR = ["08:00", "13:00", "18:00", "21:00"];
const NIGHT = [DOSE_SLOTS.night];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight for "HH:mm", or null. */
export function doseMinutes(hhmm: string): number | null {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** A valid "HH:mm" outside quiet hours (06:00 – 21:59). */
export function isAllowedDoseTime(hhmm: string): boolean {
  const min = doseMinutes(hhmm);
  return min !== null && min >= QUIET_END_MIN && min < QUIET_START_MIN;
}

/** Cleans a list of dose times: allowed, unique, sorted — or null if any is invalid / too many. */
export function normalizeDoseTimes(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every((t) => typeof t === "string" && isAllowedDoseTime(t))) return null;
  const times = [...new Set(raw as string[])].sort();
  return times.length <= MAX_DOSES_PER_DAY ? times : null;
}

export type ParsedFrequency = { kind: "times"; times: string[] } | { kind: "asNeeded" } | { kind: "unknown" };

/**
 * "1-0-1", "1-1-1-1", "BD", "TDS", "Twice daily", "At bedtime", "q8h"… into IST
 * dose times. "SOS" / "As needed" never get a reminder; anything else that
 * can't be read ("After meals", free text) is left for the patient to pick.
 */
export function parseFrequency(raw: string): ParsedFrequency {
  const s = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return { kind: "unknown" };
  if (/\b(sos|prn|stat|as needed|as required|when needed|if needed|when required)\b/.test(s)) return { kind: "asNeeded" };

  // Dose pattern: morning-noon-night (3 parts) or morning-noon-evening-night (4).
  const pattern = /^(\d+(?:\.\d+)?|½|1\/2)(?:\s*[-–—]\s*(?:\d+(?:\.\d+)?|½|1\/2)){2,3}(?![\d.\/])/.exec(s);
  if (pattern) {
    const parts = pattern[0].split(/\s*[-–—]\s*/);
    const slots = parts.length === 3 ? THREE : FOUR;
    const times = slots.filter((_, i) => Number(parts[i]) !== 0);
    return times.length ? { kind: "times", times } : { kind: "unknown" };
  }

  const every = /\b(?:q\s?(\d+)\s?h|every (\d+) ?(?:h|hr|hrs|hour|hours))\b/.exec(s);
  if (every) {
    const hours = Number(every[1] ?? every[2]);
    const byHours: Record<number, string[]> = { 6: FOUR, 8: THREE, 12: TWO, 24: ONE };
    return byHours[hours] ? { kind: "times", times: byHours[hours] } : { kind: "unknown" };
  }
  if (/\b(qid|qds|four times|4 times)\b/.test(s)) return { kind: "times", times: FOUR };
  if (/\b(tds|tid|thrice|three times|3 times)\b/.test(s)) return { kind: "times", times: THREE };
  if (/\b(bd|bid|twice|two times|2 times)\b/.test(s)) return { kind: "times", times: TWO };
  if (/\bmorning\b/.test(s) && /\b(night|bedtime|evening)\b/.test(s)) return { kind: "times", times: TWO };
  if (/\b(hs|bedtime|at night|night)\b/.test(s)) return { kind: "times", times: NIGHT };
  if (/\b(od|qd|once|daily|every day|1 time|morning)\b/.test(s)) return { kind: "times", times: ONE };
  return { kind: "unknown" };
}

/** "5 days", "x5 days", "5d", "2 weeks", "1 month", "7" → days (1…90), else null. */
export function parseDurationDays(raw: string): number | null {
  const s = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  let days: number | null = null;
  const m = /(\d+)\s*(days?|d|weeks?|wks?|w|months?|mo|m)\b/.exec(s);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2];
    days = unit.startsWith("w") ? n * 7 : unit.startsWith("m") ? n * 30 : n;
  } else {
    const bare = /^(?:x|×|for)?\s*(\d+)$/.exec(s);
    if (bare) days = Number(bare[1]);
  }
  return days !== null && Number.isInteger(days) && days >= 1 && days <= MAX_COURSE_DAYS ? days : null;
}
