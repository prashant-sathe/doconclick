// Client-safe (no prisma): the doctor registration price rule, shared by the
// server (src/lib/doctorFees.ts) and the admin settings live preview.

export const DOCTOR_REGISTRATION_FEE_MAX = 100000;
export const DEFAULT_DOCTOR_REGISTRATION_ORIGINAL_FEE = 499;

export type DoctorRegistrationPricing = {
  /** The "MRP" — struck through when there is a discount. */
  original: number;
  /** What the doctor is charged (before any coupon). ₹0 = free. */
  payable: number;
  hasDiscount: boolean;
};

const validNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Admin sets an original price and an optional discounted one. A discounted
 * price below the original is charged (original struck through); a missing
 * (null) one, or one ≥ the original, means no discount — the original is
 * charged. ₹0 is only "free" when the admin entered it as the discount.
 */
export function resolveDoctorRegistrationPricing(original: unknown, discounted: unknown): DoctorRegistrationPricing {
  const base = validNumber(original) && original > 0 ? original : DEFAULT_DOCTOR_REGISTRATION_ORIGINAL_FEE;
  if (validNumber(discounted) && discounted < base) {
    return { original: base, payable: discounted, hasDiscount: true };
  }
  return { original: base, payable: base, hasDiscount: false };
}
