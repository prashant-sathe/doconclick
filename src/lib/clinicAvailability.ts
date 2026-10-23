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

const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const nextDay = (day: string) => DAY_ORDER[(DAY_ORDER.indexOf(day) + 1) % 7];
const MIDNIGHT = 24 * 60;

// One stretch of open time on one weekday, in minutes from midnight, with
// end <= 1440.
interface SlotWindow { dayOfWeek: string; start: number; end: number }

// The open windows a clinic's slots describe — the single place that decides
// how a slot's times are read, used by every check below:
// - toTime "00:00" means "until midnight" (a time picker can't say 24:00),
//   so 20:00–00:00 is the last four hours of that day.
// - A legacy slot that runs past midnight (from > to, e.g. Mon 20:00–02:00,
//   saved before validation existed) is split: Mon 20:00–24:00 plus the tail
//   Tue 00:00–02:00 — the early hours belong to the next day, not the start
//   of the same one.
function slotWindows(slots: ClinicSlotLike[]): SlotWindow[] {
  const windows: SlotWindow[] = [];
  for (const slot of slots) {
    const from = toMinutes(slot.fromTime);
    const to = toMinutes(slot.toTime);
    if (from == null || to == null || DAY_ORDER.indexOf(slot.dayOfWeek) === -1) continue;
    const end = to === 0 ? MIDNIGHT : to;
    if (end > from) {
      windows.push({ dayOfWeek: slot.dayOfWeek, start: from, end });
    } else if (end < from) {
      windows.push({ dayOfWeek: slot.dayOfWeek, start: from, end: MIDNIGHT });
      windows.push({ dayOfWeek: nextDay(slot.dayOfWeek), start: 0, end });
    }
    // from === to (other than 00:00–00:00, a full day): zero length, ignored.
  }
  return windows;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SLOTS = 50;

// Validates a clinic's day-wise hours as sent by the clinic form: a known
// day, strict "HH:MM" 24h times, start before end (an end of "00:00" means
// midnight), and no two ranges on the same day overlapping (touching is
// fine). A clinic open past midnight is two slots: Mon 20:00–00:00 and
// Tue 00:00–02:00.
export function validateSlotInput(raw: unknown): { slots: ClinicSlotLike[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Please set at least one day-wise time slot." };
  if (raw.length > MAX_SLOTS) return { error: `Too many time slots (max ${MAX_SLOTS}).` };
  const slots: ClinicSlotLike[] = [];
  for (const item of raw) {
    const s = (item ?? {}) as Record<string, unknown>;
    const dayOfWeek = typeof s.dayOfWeek === "string" ? s.dayOfWeek : "";
    const fromTime = typeof s.fromTime === "string" ? s.fromTime : "";
    const toTime = typeof s.toTime === "string" ? s.toTime : "";
    if (!(WEEK_DAYS as readonly string[]).includes(dayOfWeek)) return { error: `"${dayOfWeek}" isn't a day of the week.` };
    if (!HHMM_RE.test(fromTime) || !HHMM_RE.test(toTime)) {
      return { error: `${dayOfWeek}: times must be HH:MM (24-hour), e.g. 09:00.` };
    }
    const from = toMinutes(fromTime)!;
    const end = toTime === "00:00" ? MIDNIGHT : toMinutes(toTime)!;
    if (from >= end) {
      return { error: `${dayOfWeek}: the closing time must be after the opening time (${formatSlotTime(fromTime)} – ${formatSlotTime(toTime)}). For hours past midnight, add the early-morning part to the next day.` };
    }
    slots.push({ dayOfWeek, fromTime, toTime });
  }
  for (const day of WEEK_DAYS) {
    const ranges = slots
      .filter((s) => s.dayOfWeek === day)
      .map((s) => ({ s, start: toMinutes(s.fromTime)!, end: s.toTime === "00:00" ? MIDNIGHT : toMinutes(s.toTime)! }))
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].start < ranges[i - 1].end) {
        const a = ranges[i - 1].s, b = ranges[i].s;
        return { error: `${day}: ${formatSlotTime(a.fromTime)} – ${formatSlotTime(a.toTime)} overlaps ${formatSlotTime(b.fromTime)} – ${formatSlotTime(b.toTime)}.` };
      }
    }
  }
  return { slots };
}

// Today's calendar date in IST as "YYYY-MM-DD" — the reference date/weekday
// this whole file's slot math is anchored to (see the "Slot-time math
// assumes IST" note elsewhere in this codebase).
export function todayIsoDateIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

// Whether a clinic is currently within one of its day-wise slots, evaluated in
// IST regardless of the visitor's timezone. A clinic with no slots at all
// (hours never configured) fails open so it's never wrongly hidden/dimmed by
// default.
// `leaves` are specific "YYYY-MM-DD" dates the clinic is closed regardless of
// its normal weekly hours (a doctor's day off) — checked first since a leave
// day overrides everything else.
export function isClinicOpenNow(slots: ClinicSlotLike[], now: Date = new Date(), leaves: string[] = []): boolean {
  if (leaves.includes(todayIsoDateIst(now))) return false;
  if (slots.length === 0) return true;

  const { weekday, minutes: nowMin } = nowInIst(now);
  return slotWindows(slots).some((w) => w.dayOfWeek === weekday && nowMin >= w.start && nowMin < w.end);
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
      for (const w of slotWindows(clinic.slots)) {
        if (w.dayOfWeek !== dayOfWeek) continue;
        if (daysAhead === 0 && w.start <= nowMin) continue; // already started/passed today
        if (w.start < bestMin) {
          bestMin = w.start;
          best = { clinic, dayOfWeek, fromTime: minutesToHHMM(w.start), daysAhead };
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

export const SLOT_INTERVAL_MINUTES = 10;

// Discrete bookable start times for one clinic on one calendar date, derived
// by dividing its day-of-week open-hour ranges into fixed intervals. `date`
// is a plain "YYYY-MM-DD" (e.g. from a patient's date picker) — its weekday
// is computed independent of any timezone (a calendar date has one weekday
// no matter where it's evaluated), and only that day's ranges are used.
// Already-past slots are dropped when `date` is today (IST). Hours are read
// through slotWindows: an "00:00" end runs to midnight, and a legacy
// overnight range contributes its after-midnight tail to the next day.
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
  const windows = slotWindows(slots).filter((w) => w.dayOfWeek === weekday).sort((a, b) => a.start - b.start);
  for (const w of windows) {
    for (let t = w.start; t + SLOT_INTERVAL_MINUTES <= w.end; t += SLOT_INTERVAL_MINUTES) {
      if (isToday && t <= nowMin) continue;
      const time = minutesToHHMM(t);
      if (result.some((r) => r.time === time)) continue; // overlapping legacy ranges
      result.push({ time, label: formatSlotTime(time) });
    }
  }
  return result;
}

// Whether a booked start time still lies inside the given weekly hours (leave
// days are ignored — those are handled by the leave flow). The time is floored
// to the 10-minute grid first, so an off-grid legacy booking isn't flagged.
export function bookingFitsHours(slots: ClinicSlotLike[], when: Date): boolean {
  const ist = new Date(when.getTime() + 5.5 * 60 * 60 * 1000).toISOString(); // IST wall clock, as UTC fields
  const minutes = Number(ist.slice(11, 13)) * 60 + Number(ist.slice(14, 16));
  const time = minutesToHHMM(Math.floor(minutes / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES);
  return generateSlotsForDate(slots, ist.slice(0, 10), new Date(0)).some((s) => s.time === time);
}

const minutesToHHMM = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

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
