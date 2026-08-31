import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder, DOCTOR_SUBSCRIPTION_FEE } from "@/lib/cashfree";
import { hasActiveDoctorSubscription } from "@/lib/subscription";
import { reserveDoctorFeeCoupon, releaseCouponRedemption } from "@/lib/coupons";

// POST: Creates a real Cashfree order to renew a doctor's monthly
// patient-access subscription. Optional body `{ code }` applies a coupon
// (appliesTo must include DOCTOR_SUBSCRIPTION).
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const profile = await prisma.doctorProfile.findUnique({ where: { userId: authUser.id } });
  if (!profile) {
    return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
  }
  if (!profile.registrationFeePaid) {
    return NextResponse.json({ error: "Complete your one-time registration fee first" }, { status: 400 });
  }
  if (hasActiveDoctorSubscription(profile)) {
    return NextResponse.json({ error: "Your plan is already active" }, { status: 400 });
  }

  const { code } = await req.json().catch(() => ({}));
  const orderId = `docsub${authUser.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));

  let coupon: { couponCode: string; discountAmount: number; netAmount: number } | null = null;
  if (typeof code === "string" && code.trim()) {
    const reserved = await prisma.$transaction((tx) =>
      reserveDoctorFeeCoupon(tx, {
        code,
        userId: authUser.id,
        context: "DOCTOR_SUBSCRIPTION",
        fee: DOCTOR_SUBSCRIPTION_FEE,
        orderId,
        previousOrderId: profile.cashfreeOrderId,
      }),
    );
    if (!reserved.ok) {
      return NextResponse.json({ error: reserved.error }, { status: 400 });
    }
    coupon = reserved;
  }

  const amount = coupon ? coupon.netAmount : DOCTOR_SUBSCRIPTION_FEE;

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount,
      customerId: authUser.id,
      customerName: authUser.name,
      customerPhone: authUser.mobile,
      returnUrl: `${origin}/doctor/subscribe/return`,
      notifyUrl: `${origin}/api/payments/webhook`,
    });

    await prisma.doctorProfile.update({
      where: { userId: authUser.id },
      data: { cashfreeOrderId: orderId },
    });

    return NextResponse.json({ paymentSessionId });
  } catch (err) {
    if (coupon) {
      await prisma.$transaction((tx) => releaseCouponRedemption(tx, { orderId })).catch(() => {});
    }
    console.error("Failed to create Cashfree order for doctor subscription renewal", authUser.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
