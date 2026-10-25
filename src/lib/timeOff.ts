import { prisma } from "@/lib/prisma";
import { istDayKey, istStartOfDay, istEndOfDay, isValidYmd, addDaysYmd } from "@/lib/istDate";
import { SLOT_INTERVAL_MINUTES } from "@/lib/clinicAvailability";
import { LIVE_STATUSES } from "@/lib/appointmentCancel";

// A provider (doctor or nurse) being away as a whole — every clinic, video
// and home visit at once:
//   • time off: a range of IST days (ProviderTimeOff), booked ahead;
//   • offline: "Go offline now", until the end of today (User.offlineUntil).
// No new booking, reschedule or acceptance can land on either; switching one
// on lists the live bookings it would hit, and cancels + refunds them once
// the provider confirms (src/app/api/provider/time-off, …/offline).

export const TIME_OFF_MAX_DAYS = 90;
export const TIME_OFF_MAX_AHEAD_DAYS = 365;
export const TIME_OFF_REASON_MAX = 200;
export const TIME_OFF_CODE = "PROVIDER_AWAY";

export type Away =
  | { kind: "OFFLINE"; until: Date }
  | { kind: "LEAVE"; startDate: string; endDate: string; reason: string | null };

const fmtDay = (ymd: string) =>
  istStartOfDay(ymd).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/** "3 Nov" or "3 Nov – 5 Nov". */
export function rangeLabel(startDate: string, endDate: string): string {
  return startDate === endDate ? fmtDay(startDate) : `${fmtDay(startDate)} – ${fmtDay(endDate)}`;
}

/** Which of these providers are away at `when` (default now), and why. */
export async function awayAt(providerIds: string[], when: Date = new Date()): Promise<Map<string, Away>> {
  const out = new Map<string, Away>();
  if (providerIds.length === 0) return out;
  const now = Date.now();
  const ymd = istDayKey(when);
  const [offline, leaves] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: providerIds }, offlineUntil: { gt: new Date(Math.max(now, when.getTime())) } },
      select: { id: true, offlineUntil: true },
    }),
    prisma.providerTimeOff.findMany({
      where: { providerId: { in: providerIds }, startDate: { lte: ymd }, endDate: { gte: ymd } },
      orderBy: { endDate: "desc" },
    }),
  ]);
  for (const l of leaves) {
    if (!out.has(l.providerId)) out.set(l.providerId, { kind: "LEAVE", startDate: l.startDate, endDate: l.endDate, reason: l.reason });
  }
  // Offline is "right now"; a leave covering the day says more, so it wins.
  for (const u of offline) if (!out.has(u.id)) out.set(u.id, { kind: "OFFLINE", until: u.offlineUntil! });
  return out;
}

/** Whether a provider takes no bookings at all on this IST day (for the slots list). */
// (Offline runs to the end of today, so it empties today too.)
export async function providerOffOnDate(providerId: string, ymd: string): Promise<boolean> {
  return (await awayAt([providerId], istStartOfDay(ymd))).has(providerId);
}

/**
 * Why `providerId` can't be booked at `when`, worded for who's asking — or
 * null. `who` is how a patient/staff member refers to the provider.
 */
export async function timeOffProblem(
  providerId: string,
  when: Date,
  viewer: "patient" | "provider" | "staff",
  who: "doctor" | "nurse" = "doctor",
): Promise<string | null> {
  const away = (await awayAt([providerId], when)).get(providerId);
  return away ? awayMessage(away, viewer, who) : null;
}

/**
 * One provider's time-off rows, fetched once so many `when`s (a package's
 * visits) can be checked in memory instead of 2 queries each.
 */
export interface TimeOffSnapshot {
  offlineUntil: Date | null;
  leaves: { startDate: string; endDate: string; reason: string | null }[];
}

export async function timeOffSnapshot(providerId: string, from: Date): Promise<TimeOffSnapshot> {
  const [user, leaves] = await Promise.all([
    prisma.user.findUnique({ where: { id: providerId }, select: { offlineUntil: true } }),
    prisma.providerTimeOff.findMany({
      where: { providerId, endDate: { gte: istDayKey(from) } },
      orderBy: { endDate: "desc" },
      select: { startDate: true, endDate: true, reason: true },
    }),
  ]);
  return { offlineUntil: user?.offlineUntil ?? null, leaves };
}

/** Same answer as timeOffProblem(), from a snapshot (no queries). */
export function timeOffProblemFrom(
  snap: TimeOffSnapshot,
  when: Date,
  viewer: "patient" | "provider" | "staff",
  who: "doctor" | "nurse" = "doctor",
): string | null {
  const ymd = istDayKey(when);
  const leave = snap.leaves.find((l) => l.startDate <= ymd && l.endDate >= ymd);
  let away: Away | null = null;
  if (leave) away = { kind: "LEAVE", startDate: leave.startDate, endDate: leave.endDate, reason: leave.reason };
  else if (snap.offlineUntil && snap.offlineUntil.getTime() > Math.max(Date.now(), when.getTime())) {
    away = { kind: "OFFLINE", until: snap.offlineUntil };
  }
  return away ? awayMessage(away, viewer, who) : null;
}

function awayMessage(away: Away, viewer: "patient" | "provider" | "staff", who: "doctor" | "nurse"): string {
  if (away.kind === "OFFLINE") {
    return viewer === "provider"
      ? "You're offline for the rest of today. Go online from your dashboard to take bookings."
      : viewer === "staff"
        ? "The doctor is offline for the rest of today, so nothing can be booked until tomorrow."
        : `This ${who} isn't taking bookings for the rest of today. Please pick another day or another ${who}.`;
  }
  const range = rangeLabel(away.startDate, away.endDate);
  return viewer === "provider"
    ? `You're on time off ${range}. Remove it to take bookings then.`
    : viewer === "staff"
      ? `The doctor is on leave ${range}, so nothing can be booked then.`
      : `This ${who} is on leave ${range}. Please pick another date or another ${who}.`;
}

const SLOT_MS = SLOT_INTERVAL_MINUTES * 60_000;
// Same test as src/lib/doctorSlots.ts (not imported: that module imports this one).
const isTimedBooking = (a: { scheduledAt: Date; createdAt: Date }) => a.scheduledAt.getTime() > a.createdAt.getTime();

/**
 * The live bookings a period away would hit: everything between `start` and
 * `end`, except visits already under way (the provider is on the road or
 * has started — they finish those) and timed visits already past (still to
 * be marked complete or no-show). Untimed "book now" requests count by when
 * they were made.
 */
export async function bookingsDuring(providerId: string, start: Date, end: Date) {
  const rows = await prisma.appointment.findMany({
    where: { doctorId: providerId, status: { in: LIVE_STATUSES }, scheduledAt: { gte: start, lte: end } },
    orderBy: { scheduledAt: "asc" },
    include: { patient: { select: { name: true } } },
  });
  const now = Date.now();
  const underWay = (a: (typeof rows)[number]) => a.visitStartedAt != null || a.travelStatus !== "NOT_STARTED";
  return {
    affected: rows.filter((a) => !underWay(a) && (!isTimedBooking(a) || a.scheduledAt.getTime() + SLOT_MS > now)),
    kept: rows.filter(underWay).length,
  };
}

/** Pending reschedule requests a patient made into the period — declined, not cancelled. */
export function rescheduleRequestsInto(providerId: string, start: Date, end: Date) {
  return prisma.appointment.findMany({
    where: { doctorId: providerId, status: "SCHEDULED", requestedScheduledAt: { gte: start, lte: end } },
    select: { id: true, patientId: true, scheduledAt: true },
  });
}

/** Validates a requested range. Returns the bounds, or an error. */
export function parseRange(startDate: unknown, endDate: unknown): { start: Date; end: Date; startDate: string; endDate: string } | { error: string } {
  if (typeof startDate !== "string" || !isValidYmd(startDate)) return { error: "Pick a valid start date." };
  const end = typeof endDate === "string" && endDate ? endDate : startDate;
  if (!isValidYmd(end)) return { error: "Pick a valid end date." };
  const today = istDayKey(new Date());
  if (startDate < today) return { error: "Time off can't start on a date that has already passed." };
  if (end < startDate) return { error: "The end date is before the start date." };
  if (end > addDaysYmd(startDate, TIME_OFF_MAX_DAYS - 1)) return { error: `Time off can be at most ${TIME_OFF_MAX_DAYS} days at once.` };
  if (startDate > addDaysYmd(today, TIME_OFF_MAX_AHEAD_DAYS)) return { error: `Time off can be added up to ${TIME_OFF_MAX_AHEAD_DAYS} days ahead.` };
  return { start: istStartOfDay(startDate), end: istEndOfDay(end), startDate, endDate: end };
}

/**
 * What a patient-facing page may know: whether the provider is away right
 * now and until when ("today" for offline), and their upcoming days off —
 * never the reason, which is private.
 */
export async function publicAvailability(providerIds: string[]) {
  const today = istDayKey(new Date());
  const [away, upcoming] = await Promise.all([
    awayAt(providerIds),
    prisma.providerTimeOff.findMany({
      where: { providerId: { in: providerIds }, endDate: { gte: today } },
      orderBy: { startDate: "asc" },
      select: { providerId: true, startDate: true, endDate: true },
    }),
  ]);
  return (id: string) => {
    const a = away.get(id);
    return {
      awayNow: !!a,
      awayUntil: a ? (a.kind === "LEAVE" ? a.endDate : "today") : null,
      timeOff: upcoming.filter((t) => t.providerId === id).map(({ startDate, endDate }) => ({ startDate, endDate })),
    };
  };
}
