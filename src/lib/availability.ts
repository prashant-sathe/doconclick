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

// An availability string is one or more segments separated by ";", each
// "<days> <from>–<to>" — e.g. "Mon, Tue, Wed 09:00–13:00; Mon, Tue, Wed
// 17:00–20:00" for a split shift (BUG-TRACKER #61). A single segment is the
// original format, so every string saved before still reads the same.
export const SEGMENT_SEPARATOR = "; ";

type Segment = { days: string[]; fromMin: number; toMin: number };

/** One segment, or null if it doesn't parse. */
function parseSegment(raw: string): Segment | null {
  const timeMatch = raw.match(TIME_RANGE_RE);
  if (!timeMatch || timeMatch.index == null) return null;
  const fromMin = parseTimeToMinutes(timeMatch[1]);
  const toMin = parseTimeToMinutes(timeMatch[2]);
  if (fromMin == null || toMin == null) return null;
  const dayPart = raw.slice(0, timeMatch.index).replace(/,\s*$/, "").trim();
  const days = parseDays(dayPart);
  if (days.length === 0) return null;
  return { days, fromMin, toMin };
}

/** Every segment, or null if any one of them doesn't parse. */
function parseSegments(availability: string | null | undefined): Segment[] | null {
  if (!availability) return null;
  const parts = availability.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const segments: Segment[] = [];
  for (const part of parts) {
    const seg = parseSegment(part);
    if (!seg) return null;
    segments.push(seg);
  }
  return segments;
}

// Parses a provider's `availability` string (e.g. "Mon, Tue, Wed
// 9:00AM–6:00PM", or several ";"-separated ranges) into structured
// day/time rows — one per day per range, so a day can appear more than once.
// Used to backfill ClinicSlot rows from legacy DoctorProfile.availability data.
export function parseAvailabilityString(
  availability: string | null | undefined
): { dayOfWeek: string; fromTime: string; toTime: string }[] {
  const segments = parseSegments(availability);
  if (!segments) return [];
  return segments.flatMap((seg) =>
    seg.days.map((dayOfWeek) => ({ dayOfWeek, fromTime: minutesToHHMM(seg.fromMin), toTime: minutesToHHMM(seg.toMin) }))
  );
}

// Whether an availability string parses (every range) into at least one day
// and non-empty time windows — the bar a provider's saved hours must clear.
// Overnight ranges (8PM–2AM) are allowed here; the doctor's form is stricter
// (availabilityProblem).
export function isValidAvailability(availability: string | null | undefined): boolean {
  const segments = parseSegments(availability);
  return !!segments && segments.every((seg) => seg.fromMin !== seg.toMin);
}

export type AvailabilityBlock = { days: string[]; from: string; to: string };

export const MAX_AVAILABILITY_BLOCKS = 10;

/** The form's blocks → the stored string ("Mon, Tue 09:00–13:00; Sat 10:00–14:00"). Days in week order. */
export function availabilityFromBlocks(blocks: AvailabilityBlock[]): string {
  return blocks
    .map((b) => `${WEEK_ORDER.filter((d) => b.days.includes(d)).join(", ")} ${b.from}–${b.to}`)
    .join(SEGMENT_SEPARATOR);
}

/** The stored string → the form's blocks (null when it doesn't parse — the form says so rather than guessing). */
export function availabilityToBlocks(availability: string | null | undefined): AvailabilityBlock[] | null {
  const segments = parseSegments(availability);
  if (!segments) return null;
  return segments.map((seg) => ({
    days: WEEK_ORDER.filter((d) => seg.days.includes(d)),
    from: minutesToHHMM(seg.fromMin),
    to: minutesToHHMM(seg.toMin),
  }));
}

const hhmm = (min: number) => to12h(minutesToHHMM(min));

/**
 * What's wrong with a doctor's Available Timings, or null if they're fine.
 * Stricter than isValidAvailability: every range needs at least one day and
 * a start before its end (same day — no overnight ranges), and two ranges
 * mustn't overlap on the same day (touching, 13:00 then 13:00, is fine).
 */
export function availabilityProblem(availability: string | null | undefined): string | null {
  if (!availability || !availability.trim()) return "Pick at least one day and a time range.";
  const parts = availability.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length > MAX_AVAILABILITY_BLOCKS) return `At most ${MAX_AVAILABILITY_BLOCKS} time ranges.`;
  const segments: Segment[] = [];
  for (const [i, part] of parts.entries()) {
    const seg = parseSegment(part);
    // "Range 2: pick…" with several ranges, "Pick…" with one.
    const say = (msg: string) => (parts.length > 1 ? `Range ${i + 1}: ${msg}` : msg.charAt(0).toUpperCase() + msg.slice(1));
    if (!seg) return say("pick at least one day and a valid start and end time.");
    if (seg.fromMin >= seg.toMin) return say(`the end time (${hhmm(seg.toMin)}) must be after the start time (${hhmm(seg.fromMin)}).`);
    segments.push(seg);
  }
  for (const day of WEEK_ORDER) {
    const ranges = segments.filter((s) => s.days.includes(day)).sort((a, b) => a.fromMin - b.fromMin);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].fromMin < ranges[i - 1].toMin) {
        return `${day}: ${hhmm(ranges[i - 1].fromMin)}–${hhmm(ranges[i - 1].toMin)} and ${hhmm(ranges[i].fromMin)}–${hhmm(ranges[i].toMin)} overlap.`;
      }
    }
  }
  return null;
}

// Whether a doctor is currently within their set "Available Timings" window,
// evaluated in IST regardless of the visitor's own timezone. Fails closed
// (returns false) on a missing or unparseable string: saved hours are
// validated with isValidAvailability, so anything else is bad data and must
// not let a patient book outside the provider's real hours.
export function isDoctorAvailableNow(availability: string | null | undefined, now: Date = new Date()): boolean {
  const segments = parseSegments(availability);
  if (!segments) return false;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const nowMin = hour * 60 + minute;

  // Inside any one of the ranges.
  return segments.some(({ days, fromMin, toMin }) => {
    if (!days.includes(weekday)) return false;
    if (fromMin <= toMin) return nowMin >= fromMin && nowMin < toMin;
    return nowMin >= fromMin || nowMin < toMin; // overnight window, e.g. 8PM–2AM
  });
}

const WEEK_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

function dayRunsLabel(days: string[], dayLabel: (day: string) => string = (d) => d): string {
  const idx = WEEK_ORDER.map((d) => days.includes(d));
  const runs: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (!idx[i]) continue;
    let j = i;
    while (j + 1 < 7 && idx[j + 1]) j++;
    runs.push(j - i >= 2 ? `${dayLabel(WEEK_ORDER[i])}–${dayLabel(WEEK_ORDER[j])}` : WEEK_ORDER.slice(i, j + 1).map(dayLabel).join(", "));
    i = j;
  }
  return runs.join(", ");
}

// Human-friendly version of an availability string for patients:
// "Mon, Tue, Wed, Thu, Fri, Sat 08:00–20:00" → "Mon–Sat, 8 AM–8 PM"; ranges
// on the same days are joined: "Mon–Fri, 9 AM–1 PM & 5 PM–8 PM; Sat, 10 AM–2 PM".
// Falls back to the raw text when it can't be parsed. `dayLabel` localizes the
// day names ("Mon" → "सोम") — client screens get it via useFormatAvailability().
export function formatAvailability(
  availability: string | null | undefined,
  opts?: { dayLabel?: (day: string) => string },
): string {
  const segments = parseSegments(availability);
  if (!segments) return availability ?? "";
  const groups: { days: string; times: string[] }[] = [];
  for (const seg of segments) {
    const days = dayRunsLabel(seg.days, opts?.dayLabel);
    const time = `${hhmm(seg.fromMin)}–${hhmm(seg.toMin)}`;
    const g = groups.find((x) => x.days === days);
    if (g) g.times.push(time);
    else groups.push({ days, times: [time] });
  }
  return groups.map((g) => `${g.days}, ${g.times.join(" & ")}`).join("; ");
}
