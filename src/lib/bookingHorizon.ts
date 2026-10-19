// Booking-horizon bounds, client-safe (no Prisma) so the admin settings form
// can share them. The live value is PlatformSettings.bookingHorizonDays —
// read it with getBookingHorizonDays() in src/lib/bookingLimits.ts.
export const BOOKING_HORIZON_DEFAULT_DAYS = 60;
export const BOOKING_HORIZON_MIN_DAYS = 7;
export const BOOKING_HORIZON_MAX_DAYS = 365;

// Chat follow-up window after a completed visit (PlatformSettings
// .chatFollowUpDays — read it with getChatFollowUpDays() in src/lib/chatAccess.ts).
export const CHAT_FOLLOW_UP_DEFAULT_DAYS = 7;
export const CHAT_FOLLOW_UP_MIN_DAYS = 0;
export const CHAT_FOLLOW_UP_MAX_DAYS = 30;
