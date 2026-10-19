// How long a patient/doctor waits after payment confirms before the "Join
// Video Call" button unlocks — shared by the server-side gate
// (api/appointments/[id]/video-token) and the client-side countdown, and
// kept in its own file (rather than agora.ts) since it needs to be safe to
// import from client components too.
export const VIDEO_UNLOCK_DELAY_SECONDS = 30;

// When a video consultation can be joined — enforced by the video-token
// route (which also covers token renewal mid-call) and mirrored by the call
// pages' "opens at …" state.
//
// - A booking for a chosen time opens VIDEO_JOIN_EARLY_MINUTES before it and
//   closes VIDEO_JOIN_LATE_MINUTES after it.
// - A "book now" request (scheduledAt == createdAt, see isTimedBooking in
//   src/lib/doctorSlots.ts) is open from the start, until
//   VIDEO_JOIN_LATE_MINUTES after it was accepted or paid, whichever is later.
//
// A call already running can outlast closesAt by up to one token lifetime.
export const VIDEO_JOIN_EARLY_MINUTES = 15;
export const VIDEO_JOIN_LATE_MINUTES = 180;

type Instant = Date | string | null | undefined;
const ms = (v: Instant) => (v ? new Date(v).getTime() : 0);

export function videoJoinWindow(appt: { scheduledAt: Instant; createdAt: Instant; acceptedAt?: Instant; paidAt?: Instant }): { opensAt: number; closesAt: number } {
  const scheduled = ms(appt.scheduledAt);
  const late = VIDEO_JOIN_LATE_MINUTES * 60_000;
  if (scheduled > ms(appt.createdAt)) {
    return { opensAt: scheduled - VIDEO_JOIN_EARLY_MINUTES * 60_000, closesAt: scheduled + late };
  }
  return { opensAt: 0, closesAt: Math.max(scheduled, ms(appt.acceptedAt), ms(appt.paidAt)) + late };
}
