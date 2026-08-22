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

// Whether a clinic is currently within one of its day-wise slots, evaluated in
// IST regardless of the visitor's timezone. A clinic with no slots at all
// (hours never configured) fails open — consistent with isDoctorAvailableNow
// in src/lib/availability.ts — so it's never wrongly hidden/dimmed by default.
export function isClinicOpenNow(slots: ClinicSlotLike[], now: Date = new Date()): boolean {
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
export function findOpenClinic<T extends { sortOrder: number; slots: ClinicSlotLike[] }>(
  clinics: T[],
  now: Date = new Date()
): T | null {
  const sorted = [...clinics].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.find((clinic) => isClinicOpenNow(clinic.slots, now)) ?? null;
}
