// What an appointment row may show its patient / provider (BUG-TRACKER #53).

/** Who acted on a booking from /admin/bookings and why (F24) — admin-only.
 *  Omitted from every Appointment read by default (the global `omit` in
 *  src/lib/prisma.ts), so no patient/provider route can return it by
 *  accident; the admin booking detail opts back in with ADMIN_AUDIT_INCLUDE. */
export const ADMIN_AUDIT_OMIT = { adminActionBy: true, adminActionReason: true, adminActionAt: true } as const;
export const ADMIN_AUDIT_INCLUDE = { adminActionBy: false, adminActionReason: false, adminActionAt: false } as const;

/** Payment-gateway ids are for the server and the admin only. Use as a
 *  Prisma `omit` on appointment reads that go to patients or providers. */
export const GATEWAY_OMIT = { cashfreeOrderId: true, cashfreePaymentId: true, ...ADMIN_AUDIT_OMIT } as const;

/** Wipes the provider's live position — written when a visit stops being
 *  live (completed, cancelled, no-show), so it isn't kept after the visit. */
export const LIVE_LOCATION_CLEARED = { doctorLat: null, doctorLng: null, doctorLocationUpdatedAt: null } as const;

/** The provider's live position is only shown while the visit is live and
 *  they're travelling / at the door. Older rows completed before
 *  LIVE_LOCATION_CLEARED was written still have one stored — this hides it. */
export function withLiveLocationOnlyWhileLive<
  T extends { status: string; travelStatus: string; doctorLat: number | null; doctorLng: number | null; doctorLocationUpdatedAt: Date | null },
>(a: T): T {
  const live = a.status === "SCHEDULED" && (a.travelStatus === "ON_THE_WAY" || a.travelStatus === "ARRIVED");
  return live ? a : { ...a, ...LIVE_LOCATION_CLEARED };
}
