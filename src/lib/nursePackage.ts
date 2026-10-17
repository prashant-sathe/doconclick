// Multi-visit nurse packages ("5 visits, every day"). Client-safe — the
// booking form previews the exact dates with this, and the booking API
// builds the real schedule with the same function so they always agree.
import { parseAvailabilityString } from "@/lib/availability";

export const PACKAGE_VISIT_OPTIONS = [1, 2, 3, 5, 7, 10, 14] as const;
export const PACKAGE_MAX_VISITS = 14;
export const PACKAGE_INTERVAL_OPTIONS = [1, 2, 3] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function istWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(d);
}

/**
 * Visit times for a package: the first at `first`, then every
 * `intervalDays` at the same clock time — pushed forward past any day the
 * nurse doesn't work, so a daily package never lands on her day off.
 */
export function buildVisitSchedule(
  first: Date,
  visits: number,
  intervalDays: number,
  availability: string | null | undefined,
): Date[] {
  const workDays = new Set(parseAvailabilityString(availability).map((r) => r.dayOfWeek));
  const works = (d: Date) => workDays.size === 0 || workDays.has(istWeekday(d));
  const out = [first];
  while (out.length < visits) {
    let next = new Date(out[out.length - 1].getTime() + intervalDays * DAY_MS);
    for (let guard = 0; guard < 7 && !works(next); guard++) next = new Date(next.getTime() + DAY_MS);
    out.push(next);
  }
  return out;
}

export function intervalLabel(intervalDays: number): string {
  return intervalDays === 1 ? "every day" : `every ${intervalDays} days`;
}

// Shift services (12h / 24h): the nurse stays for the whole duration.
export const SHIFT_MIN_LEAD_MS = 60 * 60 * 1000; // book at least an hour ahead

export function isShift(service: { kind?: string | null } | null | undefined): boolean {
  return service?.kind === "SHIFT";
}

export function shiftLabel(durationMinutes: number): string {
  const h = Math.round(durationMinutes / 60);
  return `${h}-hour shift`;
}
