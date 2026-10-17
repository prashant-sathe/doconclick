import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { generateSlotsForDate, todayIsoDateIst, SLOT_INTERVAL_MINUTES, type ClinicSlotLike } from "@/lib/clinicAvailability";

// A timed booking holds the doctor for one slot: [scheduledAt, +SLOT_INTERVAL).
// A doctor is one person, so the slot is held across ALL their clinics and
// consult types — a 10:00 clinic visit and a 10:05 video call overlap.
//
// "Book now" requests are deliberately outside this: they carry no chosen
// time (scheduledAt is stamped with createdAt by the DB default — the same
// value), and doctors accept several at once as a queue (bulk-accept).
const SLOT_MS = SLOT_INTERVAL_MINUTES * 60_000;

export function isTimedBooking(a: { scheduledAt: Date; createdAt: Date }): boolean {
  return a.scheduledAt.getTime() > a.createdAt.getTime();
}

const istParts = (d: Date) => {
  const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date, time };
};
const fmtIST = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/**
 * Snaps a requested clinic time onto the clinic's slot grid. With opening
 * hours configured the time must be one of the slots the slots API offers
 * (same generator, so the two can't disagree); a clinic without configured
 * hours is open any time, so the time is floored to the grid instead.
 */
export function snapToClinicGrid(
  clinic: { slots: ClinicSlotLike[]; leaves: { date: string }[] },
  when: Date,
): { when: Date; error: null } | { when: null; error: string } {
  const floored = new Date(Math.floor(when.getTime() / 60_000) * 60_000);
  const { date, time } = istParts(floored);
  if (clinic.slots.length === 0) {
    if (clinic.leaves.some((l) => l.date === date)) {
      return { when: null, error: "The clinic is closed on that day. Please pick another date." };
    }
    return { when: new Date(Math.floor(when.getTime() / SLOT_MS) * SLOT_MS), error: null };
  }
  const grid = generateSlotsForDate(clinic.slots, date, new Date(), clinic.leaves.map((l) => l.date));
  if (!grid.some((s) => s.time === time)) {
    return {
      when: null,
      error: date < todayIsoDateIst()
        ? "Please pick a time in the future."
        : "That time isn't one of this clinic's open slots. Please pick a slot from the list.",
    };
  }
  return { when: floored, error: null };
}

/**
 * A user-facing reason the doctor can't be booked for a slot starting at
 * `when`, or null if it's free. `against: "live"` (new bookings, patient
 * reschedules) counts pending requests and other patients' pending new-time
 * requests too; `against: "confirmed"` (the doctor accepting) only counts
 * appointments the doctor has already confirmed.
 */
export async function doctorSlotProblem(params: {
  doctorId: string;
  when: Date;
  excludeAppointmentId?: string;
  against: "live" | "confirmed";
  viewer: "patient" | "doctor";
}): Promise<string | null> {
  const { doctorId, when, excludeAppointmentId, against, viewer } = params;
  const window = { gt: new Date(when.getTime() - SLOT_MS), lt: new Date(when.getTime() + SLOT_MS) };
  const nearby = await prisma.appointment.findMany({
    where: {
      doctorId,
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      OR: [
        { status: { in: against === "live" ? ["PENDING_APPROVAL", "SCHEDULED"] : ["SCHEDULED"] }, scheduledAt: window },
        ...(against === "live" ? [{ status: "SCHEDULED", requestedScheduledAt: window }] : []),
      ],
    },
    select: { scheduledAt: true, createdAt: true, requestedScheduledAt: true, status: true },
  });
  const inWindow = (t: Date | null) => !!t && t > window.gt && t < window.lt;
  const clash = nearby.find((a) =>
    (inWindow(a.scheduledAt) && isTimedBooking(a)) || (against === "live" && inWindow(a.requestedScheduledAt)));
  if (!clash) return null;
  const clashAt = inWindow(clash.scheduledAt) ? clash.scheduledAt : clash.requestedScheduledAt!;
  return viewer === "patient"
    ? "That time was just taken by another patient. Please pick a different slot."
    : `You already have ${clash.status === "SCHEDULED" ? "a confirmed appointment" : "a request"} at ${fmtIST(clashAt)} that overlaps this one.`;
}

/** The partial unique index on live (doctorId, scheduledAt) rejected a write. */
export function isSlotIndexViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  return JSON.stringify(err.meta ?? {}).includes("scheduledAt") || err.message.includes("Appointment_doctorId_scheduledAt_live_key");
}
