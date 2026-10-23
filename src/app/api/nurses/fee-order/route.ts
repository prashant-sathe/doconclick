import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder } from "@/lib/cashfree";
import { requireActiveNurse } from "@/lib/providerGuard";
import { NURSE_REGISTRATION_ORDER_PREFIX, NURSE_SUBSCRIPTION_ORDER_PREFIX } from "@/lib/nurseConstants";
import { getNurseFees } from "@/lib/nurseFees";
import { reserveFeeCoupon, releaseCouponRedemption } from "@/lib/coupons";
import { withErrorLocale } from "@/lib/apiErrors";

// POST { kind: "REGISTRATION" | "SUBSCRIPTION", code? } — creates a Cashfree
// order for the admin-set nurse fee. A fee of ₹0 means that step doesn't
// exist, so there's nothing to pay for. `code` applies a coupon (appliesTo
// must include NURSE_REGISTRATION / NURSE_SUBSCRIPTION), same as doctors.
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "NURSE") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = await requireActiveNurse(authUser);
  if (denied) return denied;

  const { kind, code } = await req.json().catch(() => ({}));
  if (kind !== "REGISTRATION" && kind !== "SUBSCRIPTION") {
    return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
  }

  const [profile, fees] = await Promise.all([
    prisma.nurseProfile.findUnique({ where: { userId: authUser.id } }),
    getNurseFees(),
  ]);
  if (!profile) return NextResponse.json({ error: "Nurse profile not found" }, { status: 404 });

  const fee = kind === "REGISTRATION" ? fees.registrationFee : fees.subscriptionFee;
  if (fee <= 0) {
    return NextResponse.json({ error: "There's nothing to pay — this fee is currently free." }, { status: 400 });
  }
  if (kind === "REGISTRATION" && profile.registrationFeePaid) {
    return NextResponse.json({ error: "Registration fee already paid" }, { status: 400 });
  }
  if (kind === "SUBSCRIPTION" && fees.registrationFee > 0 && !profile.registrationFeePaid) {
    return NextResponse.json({ error: "Please pay the registration fee first." }, { status: 400 });
  }

  const prefix = kind === "REGISTRATION" ? NURSE_REGISTRATION_ORDER_PREFIX : NURSE_SUBSCRIPTION_ORDER_PREFIX;
  const orderId = `${prefix}${authUser.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));

  let coupon: { couponCode: string; discountAmount: number; netAmount: number } | null = null;
  if (typeof code === "string" && code.trim()) {
    const reserved = await prisma.$transaction((tx) =>
      reserveFeeCoupon(tx, {
        code,
        userId: authUser.id,
        context: kind === "REGISTRATION" ? "NURSE_REGISTRATION" : "NURSE_SUBSCRIPTION",
        fee,
        orderId,
        // A checkout abandoned earlier keeps its reservation until this replaces it.
        previousOrderId: profile.cashfreeOrderId,
      }),
    );
    if (!reserved.ok) {
      return NextResponse.json({ error: reserved.error }, { status: 400 });
    }
    coupon = reserved;
  } else if (profile.cashfreeOrderId) {
    // Paying without a coupon now: free the one held by an earlier attempt.
    await prisma.$transaction((tx) => releaseCouponRedemption(tx, { orderId: profile.cashfreeOrderId! }));
  }
  const amount = coupon ? coupon.netAmount : fee;

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount,
      customerId: authUser.id,
      customerName: authUser.name,
      customerPhone: authUser.mobile,
      returnUrl: `${origin}/nurse/profile?payment=done`,
      notifyUrl: `${origin}/api/payments/webhook`,
    });
    await prisma.nurseProfile.update({
      where: { userId: authUser.id },
      data: { cashfreeOrderId: orderId, pendingOrderAmount: amount },
    });
    return NextResponse.json({ paymentSessionId });
  } catch (err) {
    if (coupon) {
      await prisma.$transaction((tx) => releaseCouponRedemption(tx, { orderId })).catch(() => {});
    }
    console.error("Failed to create Cashfree order for nurse fee", authUser.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
});
