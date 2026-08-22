const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_ALIASES: Record<string, string> = {
  sun: "Sun", sunday: "Sun",
  mon: "Mon", monday: "Mon",
  tue: "Tue", tues: "Tue", tuesday: "Tue",
  wed: "Wed", wednesday: "Wed",
  thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
  fri: "Fri", friday: "Fri",
  sat: "Sat", saturday: "Sat",
};

function normalizeDay(token: string): string | null {
  return DAY_ALIASES[token.trim().toLowerCase()] ?? null;
}

// Doctors' availability strings come from two sources with different day
// conventions: comma-separated lists saved by the profile form ("Mon, Tue,
// Wed") and seed-style dash strings that are ambiguous between a range
// ("Mon-Sat" = Mon through Sat) and a list ("Mon-Wed-Fri" = just those three)
// — disambiguated here by token count.
function parseDays(dayPart: string): string[] {
  const commaTokens = dayPart.split(",").map((t) => t.trim()).filter(Boolean);
  if (commaTokens.length > 1) {
    return commaTokens.map(normalizeDay).filter((d): d is string => d !== null);
  }

  const dashTokens = (commaTokens[0] ?? "").split("-").map((t) => t.trim()).filter(Boolean);
  if (dashTokens.length === 2) {
    const start = normalizeDay(dashTokens[0]);
    const end = normalizeDay(dashTokens[1]);
    if (!start || !end) return [];
    const startIdx = DAY_ORDER.indexOf(start);
    const endIdx = DAY_ORDER.indexOf(end);
    if (startIdx === -1 || endIdx === -1) return [];
    const days: string[] = [];
    let i = startIdx;
    for (let guard = 0; guard < 7; guard++) {
      days.push(DAY_ORDER[i]);
      if (i === endIdx) break;
      i = (i + 1) % 7;
    }
    return days;
  }
  if (dashTokens.length > 2) {
    return dashTokens.map(normalizeDay).filter((d): d is string => d !== null);
  }
  const single = normalizeDay(dashTokens[0] ?? "");
  return single ? [single] : [];
}

function parseTimeToMinutes(raw: string): number | null {
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

const TIME_RANGE_RE = /(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*$/i;

function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Parses a doctor's free-text `availability` string (e.g. "Mon, Tue, Wed
// 9:00AM–6:00PM") into structured day/time rows, one per day. Used to
// backfill ClinicSlot rows from legacy DoctorProfile.availability data.
export function parseAvailabilityString(
  availability: string | null | undefined
): { dayOfWeek: string; fromTime: string; toTime: string }[] {
  if (!availability) return [];

  const timeMatch = availability.match(TIME_RANGE_RE);
  if (!timeMatch || timeMatch.index == null) return [];

  const fromMin = parseTimeToMinutes(timeMatch[1]);
  const toMin = parseTimeToMinutes(timeMatch[2]);
  if (fromMin == null || toMin == null) return [];

  const dayPart = availability.slice(0, timeMatch.index).replace(/,\s*$/, "").trim();
  const days = parseDays(dayPart);
  if (days.length === 0) return [];

  const fromTime = minutesToHHMM(fromMin);
  const toTime = minutesToHHMM(toMin);
  return days.map((dayOfWeek) => ({ dayOfWeek, fromTime, toTime }));
}

// Whether a doctor is currently within their set "Available Timings" window,
// evaluated in IST regardless of the visitor's own timezone. Fails open
// (returns true) on anything unparseable so a format we didn't anticipate
// never wrongly hides a doctor from the map.
export function isDoctorAvailableNow(availability: string | null | undefined, now: Date = new Date()): boolean {
  if (!availability) return true;

  const timeMatch = availability.match(TIME_RANGE_RE);
  if (!timeMatch || timeMatch.index == null) return true;

  const fromMin = parseTimeToMinutes(timeMatch[1]);
  const toMin = parseTimeToMinutes(timeMatch[2]);
  if (fromMin == null || toMin == null) return true;

  const dayPart = availability.slice(0, timeMatch.index).replace(/,\s*$/, "").trim();
  const days = parseDays(dayPart);
  if (days.length === 0) return true;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const nowMin = hour * 60 + minute;

  if (!days.includes(weekday)) return false;
  if (fromMin <= toMin) return nowMin >= fromMin && nowMin < toMin;
  return nowMin >= fromMin || nowMin < toMin; // overnight window, e.g. 8PM–2AM
}
