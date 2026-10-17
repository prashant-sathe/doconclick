// Client-safe nurse constants (no prisma import).

// Cashfree order_id prefixes for nurse fees — the shared payments webhook
// routes on these.
export const NURSE_REGISTRATION_ORDER_PREFIX = "nurreg";
export const NURSE_SUBSCRIPTION_ORDER_PREFIX = "nursub";

export const NURSE_QUALIFICATIONS = ["ANM", "GNM", "B.Sc Nursing", "Post Basic B.Sc Nursing", "M.Sc Nursing"] as const;
