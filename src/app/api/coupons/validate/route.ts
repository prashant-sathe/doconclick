import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { DOCTOR_REGISTRATION_FEE, DOCTOR_SUBSCRIPTION_FEE } from "@/lib/cashfree";
import { normalizeCode, validateCoupon, type CouponContext } from "@/lib/coupons";

const FEE_FOR: Record<string, number> = {
  DOCTOR_REGISTRATION: DOCTOR_REGISTRATION_FEE,
  DOCTOR_SUBSCRIPTION: DOCTOR_SUBSCRIPTION_FEE,
};

// POST: preview-only check of a coupon for a doctor fee. Does NOT reserve a
// slot — the create-order route re-validates and reserves authoritatively.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code, context } = await req.json();
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Enter a coupon code." }, { status: 400 });
  }
  if (context !== "DOCTOR_REGISTRATION" && context !== "DOCTOR_SUBSCRIPTION") {
    return NextResponse.json({ error: "Invalid coupon context." }, { status: 400 });
  }
  const fee = FEE_FOR[context];

  const coupon = await prisma.coupon.findUnique({ where: { code: normalizeCode(code) } });
  if (!coupon) {
    return NextResponse.json({ error: "That coupon code isn't valid." }, { status: 400 });
  }

  const redemptionCountForUser = await prisma.couponRedemption.count({
    where: { couponId: coupon.id, userId: authUser.id },
  });

  const result = validateCoupon({
    coupon,
    context: context as CouponContext,
    baseAmount: fee,
    redemptionCountForUser,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const netAmount = Math.max(0, Math.round((fee - result.discountAmount) * 100) / 100);
  if (netAmount < 1) {
    return NextResponse.json({ error: "This coupon can't be used for this fee." }, { status: 400 });
  }

  return NextResponse.json({
    code: coupon.code,
    discountAmount: result.discountAmount,
    netAmount,
  });
}
