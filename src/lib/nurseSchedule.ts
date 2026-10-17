import { prisma } from "@/lib/prisma";
import { isDoctorAvailableNow, formatAvailability } from "@/lib/availability";

// A nurse is one person travelling between homes — two visits can't overlap.
// A visit occupies its service's duration plus travel time to the next home.
export const NURSE_TRAVEL_BUFFER_MIN = 30;
const DEFAULT_VISIT_MIN = 60;

const fmt = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/**
 * Nurses (of the given ids) whose confirmed visit — duration + travel —
 * covers the current moment, so the patient list can say "On a visit now"
 * before anyone fills in the booking form.
 */
export async function nursesBusyNow(nurseIds: string[]): Promise<Set<string>> {
  if (nurseIds.length === 0) return new Set();
  const now = Date.now();
  const recent = await prisma.appointment.findMany({
    where: {
      doctorId: { in: nurseIds },
      status: "SCHEDULED",
      scheduledAt: { gte: new Date(now - 24 * 60 * 60 * 1000), lte: new Date(now) },
    },
    select: { doctorId: true, scheduledAt: true, nurseService: { select: { durationMinutes: true } } },
  });
  return new Set(
    recent
      .filter((a) => a.scheduledAt.getTime() + ((a.nurseService?.durationMinutes ?? DEFAULT_VISIT_MIN) + NURSE_TRAVEL_BUFFER_MIN) * 60000 > now)
      .map((a) => a.doctorId)
  );
}

/**
 * Returns a user-facing reason this nurse can't take a visit at `when`, or
 * null if the slot is free. Checks the nurse's working hours (IST) and any
 * already-confirmed (SCHEDULED) visit that overlaps.
 */
export async function nurseSlotProblem(params: {
  nurseId: string;
  availability: string | null | undefined;
  when: Date;
  durationMinutes: number | null | undefined;
  excludeAppointmentId?: string;
  viewer: "patient" | "nurse";
  /** Off when the nurse herself accepts — taking a visit just past her hours is her call. */
  checkHours?: boolean;
}): Promise<string | null> {
  const { nurseId, availability, when, excludeAppointmentId, viewer } = params;
  const duration = (params.durationMinutes ?? DEFAULT_VISIT_MIN) + NURSE_TRAVEL_BUFFER_MIN;

  if (params.checkHours !== false && !isDoctorAvailableNow(availability, when)) {
    return viewer === "patient"
      ? `This nurse works ${formatAvailability(availability)}. Please pick a time within those hours.`
      : `That time is outside your working hours (${formatAvailability(availability)}).`;
  }

  // Longest service is a few hours — a ±1 day window is plenty to find overlaps.
  const dayMs = 24 * 60 * 60 * 1000;
  const nearby = await prisma.appointment.findMany({
    where: {
      doctorId: nurseId,
      status: "SCHEDULED",
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      scheduledAt: { gte: new Date(when.getTime() - dayMs), lte: new Date(when.getTime() + dayMs) },
    },
    select: { scheduledAt: true, serviceName: true, nurseService: { select: { durationMinutes: true } } },
  });

  const start = when.getTime();
  const end = start + duration * 60000;
  const clash = nearby.find((a) => {
    const s = a.scheduledAt.getTime();
    const e = s + ((a.nurseService?.durationMinutes ?? DEFAULT_VISIT_MIN) + NURSE_TRAVEL_BUFFER_MIN) * 60000;
    return start < e && s < end;
  });
  if (!clash) return null;

  // Long bookings (shifts) read wrongly as a start time alone — "busy at
  // 8 PM" doesn't explain why 8 AM next day is taken. Show the span.
  const clashMin = clash.nurseService?.durationMinutes ?? DEFAULT_VISIT_MIN;
  const span = clashMin >= 180
    ? `from ${fmt(clash.scheduledAt)} to ${fmt(new Date(clash.scheduledAt.getTime() + clashMin * 60000))}`
    : `around ${fmt(clash.scheduledAt)}`;
  return viewer === "patient"
    ? `This nurse is already booked ${span}. Please pick another time or another nurse.`
    : `You already have a confirmed ${clash.serviceName ?? "visit"} ${span} — it overlaps this one.`;
}
