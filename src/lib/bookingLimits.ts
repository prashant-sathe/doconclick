// Guards shared by the booking routes (POST /api/appointments, POST
// /api/nurse-bookings) and the patient reschedule in
// /api/appointments/[id]: how far ahead a time may be, whether it's within
// the doctor's hours, how many open requests a patient may have with one
// provider, and a per-user rate limit on booking POSTs.

import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rateLimit";
import { isDoctorAvailableNow, formatAvailability } from "@/lib/availability";
import { BOOKING_HORIZON_DEFAULT_DAYS } from "@/lib/bookingHorizon";

/** The admin-set horizon (PlatformSettings.bookingHorizonDays), in days. */
export async function getBookingHorizonDays(): Promise<number> {
  const settings = await prisma.platformSettings.findFirst({ select: { bookingHorizonDays: true } });
  return settings?.bookingHorizonDays ?? BOOKING_HORIZON_DEFAULT_DAYS;
}

/** A user-facing reason `when` is too far ahead, or null. */
export function horizonProblem(when: Date, horizonDays: number, now: Date = new Date()): string | null {
  return when.getTime() > now.getTime() + horizonDays * 24 * 60 * 60_000
    ? `You can book up to ${horizonDays} days ahead. Please pick an earlier date.`
    : null;
}

/**
 * A user-facing reason a scheduled HOME/VIDEO time falls outside the doctor's
 * "Available Timings" (DoctorProfile.availability), or null. Clinic visits are
 * checked against the clinic's own slots instead.
 */
export function doctorHoursProblem(availability: string | null | undefined, when: Date): string | null {
  if (isDoctorAvailableNow(availability, when)) return null;
  const hours = formatAvailability(availability);
  return hours
    ? `The doctor is available ${hours}. Please pick a time within those hours.`
    : "The doctor hasn't set their available hours yet, so a time can't be booked. Try booking for now instead.";
}

/**
 * Most requests one patient can have waiting on one provider at once. A few,
 * not one, so a parent can book themselves and a child with the same doctor.
 */
export const MAX_OPEN_REQUESTS_PER_PROVIDER = 3;

/**
 * A user-facing reason the patient already has too many requests awaiting
 * this provider's answer, or null. A nurse package (several PENDING visits
 * sharing a packageId) counts as one request.
 */
export async function openRequestsProblem(patientId: string, providerId: string): Promise<string | null> {
  const pending = await prisma.appointment.findMany({
    where: { patientId, doctorId: providerId, status: "PENDING_APPROVAL" },
    select: { id: true, packageId: true },
  });
  const requests = new Set(pending.map((a) => a.packageId ?? a.id)).size;
  return requests >= MAX_OPEN_REQUESTS_PER_PROVIDER
    ? `You already have ${requests} requests waiting for this provider to respond. Please wait for them to reply, or cancel one, before booking again.`
    : null;
}

/** Booking POSTs per user: 10 per 10 minutes, shared by doctor and nurse bookings. */
export const checkBookingRateLimit = createRateLimiter(10, 10 * 60_000);
