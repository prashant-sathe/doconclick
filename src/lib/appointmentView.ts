// What an appointment row may show its patient / provider (BUG-TRACKER #53).

/** Payment-gateway ids are for the server and the admin only. Use as a
 *  Prisma `omit` on appointment reads that go to patients or providers. */
export const GATEWAY_OMIT = { cashfreeOrderId: true, cashfreePaymentId: true } as const;

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
