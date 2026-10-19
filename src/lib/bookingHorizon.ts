// Booking-horizon bounds, client-safe (no Prisma) so the admin settings form
// can share them. The live value is PlatformSettings.bookingHorizonDays —
// read it with getBookingHorizonDays() in src/lib/bookingLimits.ts.
export const BOOKING_HORIZON_DEFAULT_DAYS = 60;
export const BOOKING_HORIZON_MIN_DAYS = 7;
export const BOOKING_HORIZON_MAX_DAYS = 365;
