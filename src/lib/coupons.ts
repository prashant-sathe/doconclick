import type { Coupon, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export const DISCOUNT_TYPES = ["PERCENT", "FLAT"] as const;
export const COUPON_CONSULT_TYPES = ["CLINIC", "VIDEO", "HOME"] as const;
export const COUPON_APPLIES_TO = ["APPOINTMENT", "DOCTOR_REGISTRATION", "DOCTOR_SUBSCRIPTION"] as const;
export type CouponContext = (typeof COUPON_APPLIES_TO)[number];

/** The contexts a coupon is valid for; empty/legacy value means APPOINTMENT only. */
export function couponContexts(coupon: Pick<Coupon, "appliesTo">): string[] {
  const list = (coupon.appliesTo ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length ? list : ["APPOINTMENT"];
}

const CONTEXT_LABEL: Record<string, string> = {
  APPOINTMENT: "consultation bookings",
  DOCTOR_REGISTRATION: "the doctor registration fee",
  DOCTOR_SUBSCRIPTION: "doctor plan renewals",
};

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** What the patient actually pays once a coupon discount is applied. */
export function netPayable(appt: { amount: number; discountAmount: number }): number {
  return Math.max(0, round2(appt.amount - appt.discountAmount));
}

/** Rupee discount a coupon yields against a base amount (never exceeds it). */
export function computeDiscount(
  coupon: Pick<Coupon, "discountType" | "discountValue" | "maxDiscount">,
  baseAmount: number,
): number {
  let discount: number;
  if (coupon.discountType === "PERCENT") {
    discount = (baseAmount * coupon.discountValue) / 100;
    if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.discountValue;
  }
  return round2(Math.min(discount, baseAmount));
}

type ValidateArgs = {
  coupon: Coupon;
  context: CouponContext;
  baseAmount: number;
  /** required when context is APPOINTMENT */
  consultType?: string;
  redemptionCountForUser: number;
  now?: Date;
};

export type ValidateResult =
  | { ok: true; discountAmount: number }
  | { ok: false; error: string };

/**
 * Checks everything except the global `maxRedemptions` cap — that is enforced
 * atomically via `usedCount` when the coupon is reserved.
 */
export function validateCoupon({
  coupon,
  context,
  baseAmount,
  consultType,
  redemptionCountForUser,
  now = new Date(),
}: ValidateArgs): ValidateResult {
  if (!coupon.isActive) {
    return { ok: false, error: "This coupon is no longer active." };
  }
  if (!couponContexts(coupon).includes(context)) {
    return { ok: false, error: `This coupon can only be used for ${CONTEXT_LABEL[context] ?? "other payments"}.` };
  }
  if (coupon.startsAt && now < coupon.startsAt) {
    return { ok: false, error: "This coupon isn't active yet." };
  }
  if (coupon.expiresAt && now > coupon.expiresAt) {
    return { ok: false, error: "This coupon has expired." };
  }
  if (baseAmount < coupon.minAmount) {
    return { ok: false, error: `This coupon needs a minimum amount of ₹${coupon.minAmount}.` };
  }
  if (context === "APPOINTMENT") {
    const allowedTypes = (coupon.consultTypes ?? "")
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (allowedTypes.length > 0 && !allowedTypes.includes((consultType ?? "").toUpperCase())) {
      return { ok: false, error: "This coupon doesn't apply to this type of consultation." };
    }
  }
  if (redemptionCountForUser >= coupon.perUserLimit) {
    return { ok: false, error: "You've already used this coupon." };
  }

  const discountAmount = computeDiscount(coupon, baseAmount);
  if (discountAmount <= 0) {
    return { ok: false, error: "This coupon has no effect on this amount." };
  }
  return { ok: true, discountAmount };
}

type CouponInput = {
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  minAmount: number;
  appliesTo: string;
  consultTypes: string | null;
  maxRedemptions: number | null;
  perUserLimit: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
};

function optionalNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function optionalDate(v: unknown): Date | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Validates an admin create/edit payload for a coupon. Returns a Prisma-ready
 * partial `data` object or an error message. With `partial: true` only the
 * keys present in `body` are validated and returned (for PATCH).
 */
export function parseCouponInput(
  body: Record<string, unknown>,
  { partial }: { partial: boolean },
): { data: Partial<CouponInput> } | { error: string } {
  const data: Partial<CouponInput> = {};
  const has = (k: string) => k in body && body[k] !== undefined;

  if (!partial || has("code")) {
    const code = normalizeCode(String(body.code ?? ""));
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
      return { error: "Code must be 3–24 letters, digits, dashes or underscores." };
    }
    data.code = code;
  }
  if (has("description")) {
    data.description = body.description ? String(body.description).trim() : null;
  }

  const discountType = has("discountType") ? String(body.discountType) : partial ? undefined : "PERCENT";
  if (discountType !== undefined) {
    if (!DISCOUNT_TYPES.includes(discountType as (typeof DISCOUNT_TYPES)[number])) {
      return { error: "Discount type must be PERCENT or FLAT." };
    }
    data.discountType = discountType;
  }

  if (!partial || has("discountValue")) {
    const value = Number(body.discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      return { error: "Discount value must be greater than 0." };
    }
    const effectiveType = data.discountType ?? "PERCENT";
    if (effectiveType === "PERCENT" && value > 100) {
      return { error: "A percentage discount can't be more than 100." };
    }
    data.discountValue = value;
  }

  if (has("maxDiscount")) {
    const m = optionalNumber(body.maxDiscount);
    if (Number.isNaN(m) || (m != null && m <= 0)) {
      return { error: "Max discount must be a positive amount." };
    }
    data.maxDiscount = m;
  }
  if (has("minAmount")) {
    const m = optionalNumber(body.minAmount);
    if (m == null) data.minAmount = 0;
    else if (Number.isNaN(m) || m < 0) return { error: "Minimum amount can't be negative." };
    else data.minAmount = m;
  }
  if (!partial || has("appliesTo")) {
    const raw = Array.isArray(body.appliesTo)
      ? body.appliesTo
      : String(body.appliesTo ?? "").split(",");
    const values = raw.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
    if (values.some((v) => !COUPON_APPLIES_TO.includes(v as CouponContext))) {
      return { error: "“Applies to” must be APPOINTMENT, DOCTOR_REGISTRATION or DOCTOR_SUBSCRIPTION." };
    }
    data.appliesTo = (values.length ? values : ["APPOINTMENT"]).join(",");
  }
  if (has("consultTypes")) {
    const raw = Array.isArray(body.consultTypes)
      ? body.consultTypes
      : String(body.consultTypes ?? "").split(",");
    const types = raw
      .map((t) => String(t).trim().toUpperCase())
      .filter(Boolean);
    if (types.some((t) => !COUPON_CONSULT_TYPES.includes(t as (typeof COUPON_CONSULT_TYPES)[number]))) {
      return { error: "Consultation types must be CLINIC, VIDEO or HOME." };
    }
    data.consultTypes = types.length ? types.join(",") : null;
  }
  if (has("maxRedemptions")) {
    const m = optionalNumber(body.maxRedemptions);
    if (Number.isNaN(m) || (m != null && (m < 1 || !Number.isInteger(m)))) {
      return { error: "Total usage limit must be a whole number of at least 1." };
    }
    data.maxRedemptions = m;
  }
  if (has("perUserLimit")) {
    const m = optionalNumber(body.perUserLimit);
    if (m == null) data.perUserLimit = 1;
    else if (Number.isNaN(m) || m < 1 || !Number.isInteger(m)) {
      return { error: "Per-user limit must be a whole number of at least 1." };
    } else data.perUserLimit = m;
  }
  if (has("startsAt")) {
    const d = optionalDate(body.startsAt);
    if (d === undefined) return { error: "Start date is invalid." };
    data.startsAt = d;
  }
  if (has("expiresAt")) {
    const d = optionalDate(body.expiresAt);
    if (d === undefined) return { error: "Expiry date is invalid." };
    data.expiresAt = d;
  }
  if (has("isActive")) {
    data.isActive = Boolean(body.isActive);
  }

  const startsAt = data.startsAt ?? null;
  const expiresAt = data.expiresAt ?? null;
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    return { error: "Expiry must be after the start date." };
  }

  return { data };
}

// Identifies a single redemption: a patient booking (appointmentId) or a
// doctor fee Cashfree order (orderId).
type RedemptionSelector = { appointmentId: string } | { orderId: string };

/**
 * Atomically claims a coupon slot and writes a RESERVED redemption row. The
 * WHERE clause on `updateMany` is the race guard for `maxRedemptions`.
 * Caller must run this inside a transaction.
 */
export async function reserveCoupon(
  tx: Prisma.TransactionClient,
  args: {
    coupon: Pick<Coupon, "id" | "code" | "maxRedemptions">;
    userId: string;
    discountAmount: number;
    kind: string;
    appointmentId?: string;
    orderId?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const claimed = await tx.coupon.updateMany({
    where: {
      id: args.coupon.id,
      isActive: true,
      ...(args.coupon.maxRedemptions != null ? { usedCount: { lt: args.coupon.maxRedemptions } } : {}),
    },
    data: { usedCount: { increment: 1 } },
  });
  if (claimed.count === 0) return { ok: false, error: "This coupon has reached its usage limit." };

  await tx.couponRedemption.create({
    data: {
      couponId: args.coupon.id,
      userId: args.userId,
      kind: args.kind,
      appointmentId: args.appointmentId ?? null,
      orderId: args.orderId ?? null,
      discountAmount: args.discountAmount,
      status: "RESERVED",
    },
  });
  return { ok: true };
}

/**
 * Full server-side flow for attaching a coupon to a doctor fee payment:
 * validate → release any stale reservation from a previous checkout attempt →
 * atomically reserve. Returns the discounted amount to charge. Call inside a
 * transaction, after the Cashfree order has been created for `netAmount`.
 */
export async function reserveDoctorFeeCoupon(
  tx: Prisma.TransactionClient,
  args: {
    code: string;
    userId: string;
    context: "DOCTOR_REGISTRATION" | "DOCTOR_SUBSCRIPTION";
    fee: number;
    orderId: string;
    previousOrderId?: string | null;
  },
): Promise<{ ok: true; couponCode: string; discountAmount: number; netAmount: number } | { ok: false; error: string }> {
  const coupon = await tx.coupon.findUnique({ where: { code: normalizeCode(args.code) } });
  if (!coupon) return { ok: false, error: "That coupon code isn't valid." };

  if (args.previousOrderId && args.previousOrderId !== args.orderId) {
    await releaseCouponRedemption(tx, { orderId: args.previousOrderId });
  }

  const redemptionCountForUser = await tx.couponRedemption.count({
    where: { couponId: coupon.id, userId: args.userId, orderId: { not: args.orderId } },
  });

  const result = validateCoupon({
    coupon,
    context: args.context,
    baseAmount: args.fee,
    redemptionCountForUser,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const netAmount = Math.max(0, round2(args.fee - result.discountAmount));
  if (netAmount < 1) return { ok: false, error: "This coupon can't be used for this fee." };

  const reserved = await reserveCoupon(tx, {
    coupon,
    userId: args.userId,
    discountAmount: result.discountAmount,
    kind: args.context,
    orderId: args.orderId,
  });
  if (!reserved.ok) return reserved;

  return { ok: true, couponCode: coupon.code, discountAmount: result.discountAmount, netAmount };
}

/**
 * Flips a RESERVED coupon redemption to CONFIRMED once payment succeeds.
 * Idempotent — safe to call from the (retried) Cashfree webhook and from
 * wallet pay. `usedCount` is not touched; the slot was counted at reserve time.
 */
export async function confirmCouponRedemption(
  client: PrismaClientOrTx,
  selector: RedemptionSelector,
): Promise<void> {
  await client.couponRedemption.updateMany({
    where: { ...selector, status: "RESERVED" },
    data: { status: "CONFIRMED" },
  });
}

/**
 * Releases a RESERVED (unpaid) coupon redemption: deletes the redemption row,
 * decrements the coupon's `usedCount`, and — for an appointment redemption —
 * clears the coupon fields on the appointment. No-op if the redemption is
 * already CONFIRMED (i.e. it was paid) or absent.
 */
export async function releaseCouponRedemption(
  client: PrismaClientOrTx,
  selector: RedemptionSelector,
): Promise<void> {
  const redemption = await client.couponRedemption.findUnique({ where: selector });
  if (!redemption || redemption.status !== "RESERVED") return;

  await client.couponRedemption.delete({ where: { id: redemption.id } });
  await client.coupon.updateMany({
    where: { id: redemption.couponId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
  if (redemption.appointmentId) {
    await client.appointment.update({
      where: { id: redemption.appointmentId },
      data: { couponId: null, couponCode: null, discountAmount: 0 },
    });
  }
}
