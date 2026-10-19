// When a doctor/nurse may start a home-visit journey ("Start journey" →
// ON_THE_WAY): within JOURNEY_START_WINDOW_HOURS either side of the visit —
// so the patient isn't told "your nurse is on the way" a day early, and a
// visit long past is rescheduled rather than started. Enforced by
// PATCH /api/appointments/[id]/travel. Client-safe.
//
// The visit time is scheduledAt for a booking at a chosen time; for a "book
// now" request (scheduledAt == createdAt) it's when it was accepted.
export const JOURNEY_START_WINDOW_HOURS = 3;

type Instant = Date | string | null | undefined;
const ms = (v: Instant) => (v ? new Date(v).getTime() : 0);

export function journeyStartWindow(appt: { scheduledAt: Instant; createdAt: Instant; acceptedAt?: Instant }): { opensAt: number; closesAt: number } {
  const scheduled = ms(appt.scheduledAt);
  const anchor = scheduled > ms(appt.createdAt) ? scheduled : Math.max(scheduled, ms(appt.acceptedAt));
  const span = JOURNEY_START_WINDOW_HOURS * 60 * 60_000;
  return { opensAt: anchor - span, closesAt: anchor + span };
}

/** A user-facing reason the journey can't start now, or null. */
export function journeyStartProblem(
  appt: { scheduledAt: Instant; createdAt: Instant; acceptedAt?: Instant },
  now: number = Date.now(),
): { code: "JOURNEY_TOO_EARLY" | "JOURNEY_TOO_LATE"; message: string } | null {
  const { opensAt, closesAt } = journeyStartWindow(appt);
  const fmt = (t: number) => new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  if (now < opensAt) {
    return { code: "JOURNEY_TOO_EARLY", message: `You can start the journey from ${fmt(opensAt)} — up to ${JOURNEY_START_WINDOW_HOURS} hours before the visit.` };
  }
  if (now > closesAt) {
    return { code: "JOURNEY_TOO_LATE", message: `This visit was due more than ${JOURNEY_START_WINDOW_HOURS} hours ago. Contact the patient to reschedule or cancel it.` };
  }
  return null;
}
