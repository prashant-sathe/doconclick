export interface ClinicSlotLike {
  dayOfWeek: string;
  fromTime: string; // "HH:MM", 24h
  toTime: string; // "HH:MM", 24h
}

function toMinutes(hhmm: string): number | null {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function nowInIst(now: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday, minutes: hour * 60 + minute };
}

// Today's calendar date in IST as "YYYY-MM-DD" — the reference date/weekday
// this whole file's slot math is anchored to (see the "Slot-time math
// assumes IST" note elsewhere in this codebase).
export function todayIsoDateIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

// Whether a clinic is currently within one of its day-wise slots, evaluated in
// IST regardless of the visitor's timezone. A clinic with no slots at all
// (hours never configured) fails open — consistent with isDoctorAvailableNow
// in src/lib/availability.ts — so it's never wrongly hidden/dimmed by default.
// `leaves` are specific "YYYY-MM-DD" dates the clinic is closed regardless of
// its normal weekly hours (a doctor's day off) — checked first since a leave
// day overrides everything else.
export function isClinicOpenNow(slots: ClinicSlotLike[], now: Date = new Date(), leaves: string[] = []): boolean {
  if (leaves.includes(todayIsoDateIst(now))) return false;
  if (slots.length === 0) return true;

  const { weekday, minutes: nowMin } = nowInIst(now);
  return slots.some((slot) => {
    if (slot.dayOfWeek !== weekday) return false;
    const fromMin = toMinutes(slot.fromTime);
    const toMin = toMinutes(slot.toTime);
    if (fromMin == null || toMin == null) return false;
    if (fromMin <= toMin) return nowMin >= fromMin && nowMin < toMin;
    return nowMin >= fromMin || nowMin < toMin; // overnight window, e.g. 20:00–02:00
  });
}

// Returns the first currently-open clinic (by sortOrder) among a doctor's
// clinics, or null if none are open right now — used to suggest an
// alternative location when the clinic a patient tapped is closed.
export function findOpenClinic<T extends { sortOrder: number; slots: ClinicSlotLike[]; leaves?: string[] }>(
  clinics: T[],
  now: Date = new Date()
): T | null {
  const sorted = [...clinics].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.find((clinic) => isClinicOpenNow(clinic.slots, now, clinic.leaves ?? [])) ?? null;
}

const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export interface NextOpening<T> {
  clinic: T;
  dayOfWeek: string;
  fromTime: string;
  daysAhead: number; // 0 = later today, 1 = tomorrow, ...
}

// Scans up to 7 days ahead (from `now`, in IST) across a doctor's clinics for
// the earliest upcoming opening — used to tell a patient when/where a doctor
// who's closed everywhere right now will next be available. Returns null if
// none of the clinics have any slots configured (nothing to suggest). A
// clinic on leave for a given date is skipped for that date entirely, same
// as isClinicOpenNow.
export function findNextOpening<T extends { slots: ClinicSlotLike[]; leaves?: string[] }>(
  clinics: T[],
  now: Date = new Date()
): NextOpening<T> | null {
  const { weekday, minutes: nowMin } = nowInIst(now);
  const todayIdx = DAY_ORDER.indexOf(weekday);
  if (todayIdx === -1) return null;
  const todayIso = todayIsoDateIst(now);

  for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
    const dayOfWeek = DAY_ORDER[(todayIdx + daysAhead) % 7];
    const dateIso = addDaysIso(todayIso, daysAhead);
    let best: NextOpening<T> | null = null;
    let bestMin = Infinity;

    for (const clinic of clinics) {
      if (clinic.leaves?.includes(dateIso)) continue;
      for (const slot of clinic.slots) {
        if (slot.dayOfWeek !== dayOfWeek) continue;
        const fromMin = toMinutes(slot.fromTime);
        if (fromMin == null) continue;
        if (daysAhead === 0 && fromMin <= nowMin) continue; // already started/passed today
        if (fromMin < bestMin) {
          bestMin = fromMin;
          best = { clinic, dayOfWeek, fromTime: slot.fromTime, daysAhead };
        }
      }
    }

    if (best) return best;
  }

  return null;
}

const DAY_LABEL: Record<string, string> = {
  Sun: "Sun", Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat",
};

export interface ClinicDayHours {
  dayOfWeek: string; // "Mon"
  label: string; // "Mon"
  ranges: string[]; // ["9:00 AM – 1:00 PM", "5:00 PM – 8:00 PM"]
}

// Groups a clinic's slots by weekday (Mon→Sun order), each day's time ranges
// sorted by start time — for showing a patient when the clinic is actually open.
export function formatClinicHours(slots: ClinicSlotLike[]): ClinicDayHours[] {
  const byDay = new Map<string, { from: number; text: string }[]>();
  for (const slot of slots) {
    const fromMin = toMinutes(slot.fromTime);
    if (fromMin == null || toMinutes(slot.toTime) == null) continue;
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push({ from: fromMin, text: `${formatSlotTime(slot.fromTime)} – ${formatSlotTime(slot.toTime)}` });
    byDay.set(slot.dayOfWeek, list);
  }
  const weekOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return weekOrder
    .filter((day) => byDay.has(day))
    .map((day) => ({
      dayOfWeek: day,
      label: DAY_LABEL[day] ?? day,
      ranges: (byDay.get(day) ?? []).sort((a, b) => a.from - b.from).map((r) => r.text),
    }));
}

export interface TimeSlot {
  time: string; // "HH:MM", 24h — the slot's start time
  label: string; // "2:00 PM"
}

const SLOT_INTERVAL_MINUTES = 10;

// Discrete bookable start times for one clinic on one calendar date, derived
// by dividing its day-of-week open-hour ranges into fixed intervals. `date`
// is a plain "YYYY-MM-DD" (e.g. from a patient's date picker) — its weekday
// is computed independent of any timezone (a calendar date has one weekday
// no matter where it's evaluated), and only that day's ranges are used.
// Already-past slots are dropped when `date` is today (IST). Overnight
// ranges (toTime <= fromTime, e.g. "20:00"–"02:00") are skipped rather than
// wrapped — a rare enough case that it's not worth the extra complexity here.
export function generateSlotsForDate(
  slots: ClinicSlotLike[],
  date: string,
  now: Date = new Date(),
  leaves: string[] = []
): TimeSlot[] {
  if (leaves.includes(date)) return [];
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [];
  const [, yStr, mStr, dStr] = match;
  const weekday = DAY_ORDER[new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr))).getUTCDay()];
  const isToday = date === todayIsoDateIst(now);
  const nowMin = isToday ? nowInIst(now).minutes : -1;

  const result: TimeSlot[] = [];
  for (const slot of slots) {
    if (slot.dayOfWeek !== weekday) continue;
    const fromMin = toMinutes(slot.fromTime);
    const toMin = toMinutes(slot.toTime);
    if (fromMin == null || toMin == null || toMin <= fromMin) continue;
    for (let t = fromMin; t + SLOT_INTERVAL_MINUTES <= toMin; t += SLOT_INTERVAL_MINUTES) {
      if (isToday && t <= nowMin) continue;
      const time = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      result.push({ time, label: formatSlotTime(time) });
    }
  }
  return result;
}

// "14:05" → "2:05 PM"
export function formatSlotTime(hhmm: string): string {
  const min = toMinutes(hhmm);
  if (min == null) return hhmm;
  const hour24 = Math.floor(min / 60);
  const minute = min % 60;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;
}
