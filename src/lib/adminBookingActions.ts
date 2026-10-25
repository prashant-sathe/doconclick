// Limits on the reason an admin gives for cancelling, reassigning or marking a
// booking a no-show (POST /api/admin/bookings/[id]/action). Client-safe (no
// Prisma) so /admin/bookings can check the same rules before sending. The
// reason is stored on the booking's audit fields and only admins see it.
export const BOOKING_ACTION_REASON_MIN = 5;
export const BOOKING_ACTION_REASON_MAX = 300;
