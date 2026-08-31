import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCashfreeWebhookSignature, DOCTOR_REGISTRATION_FEE, DOCTOR_SUBSCRIPTION_FEE } from "@/lib/cashfree";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { WALLET_TOPUP_ORDER_PREFIX } from "@/lib/wallet";
import { netPayable, confirmCouponRedemption, releaseCouponRedemption } from "@/lib/coupons";

interface CashfreeWebhookPayload {
  type: "PAYMENT_SUCCESS_WEBHOOK" | "PAYMENT_FAILED_WEBHOOK" | string;
  event_time: string;
  data: {
    order: { order_id: string; order_amount: number };
    payment: { cf_payment_id: string; payment_status: string };
  };
}

// POST: Cashfree calls this server-to-server when a payment succeeds/fails.
// No session auth here — trust comes entirely from the signature check below,
// which is why the raw body must be verified before it's ever parsed as JSON.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }
  if (!verifyCashfreeWebhookSignature(rawBody, timestamp, signature)) {
    console.error("Cashfree webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: CashfreeWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.type === "PAYMENT_FAILED_WEBHOOK") {
    const failedOrderId = payload.data?.order?.order_id;
    console.log("Cashfree payment failed for order", failedOrderId);
    // Only wallet top-ups need explicit failure handling here — a failed
    // appointment/doctor-fee payment just leaves paymentStatus at PENDING,
    // indistinguishable from "not yet paid" (the patient can just retry).
    // A wallet TOPUP row, though, is created PENDING up front and must be
    // settled to a terminal state or the top-up return page polls to a
    // timeout instead of showing a clean failure.
    if (failedOrderId?.startsWith(WALLET_TOPUP_ORDER_PREFIX)) {
      const txn = await prisma.walletTransaction.findFirst({
        where: { cashfreeOrderId: failedOrderId, status: "PENDING" },
        include: { wallet: true },
      });
      if (txn) {
        await prisma.walletTransaction.update({ where: { id: txn.id }, data: { status: "FAILED" } });
        void sendPushToUser(txn.wallet.userId, {
          title: "Wallet top-up failed",
          body: `Your top-up of ₹${txn.amount} didn't go through. No amount was deducted.`,
          url: "/patient/wallet",
        });
      }
    }
    // Free any coupon slot a doctor reserved for this failed fee payment.
    if (failedOrderId && (failedOrderId.startsWith("docreg") || failedOrderId.startsWith("docsub"))) {
      await prisma.$transaction((tx) => releaseCouponRedemption(tx, { orderId: failedOrderId })).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  if (payload.type !== "PAYMENT_SUCCESS_WEBHOOK") {
    // Other event types (refunds, disputes, etc.) aren't handled yet — ack so Cashfree doesn't retry.
    return NextResponse.json({ ok: true });
  }

  const orderId = payload.data.order.order_id;

  // Two order types share this one webhook (Cashfree webhooks are registered
  // once per merchant account, not per order kind) — distinguished by the
  // order_id prefix each create-order route generates.
  if (orderId.startsWith("docreg")) {
    const profile = await prisma.doctorProfile.findFirst({ where: { cashfreeOrderId: orderId } });
    if (!profile) {
      console.error("Cashfree webhook: no doctor profile found for order", orderId);
      return NextResponse.json({ ok: true });
    }
    const redemption = await prisma.couponRedemption.findUnique({
      where: { orderId },
      include: { coupon: { select: { code: true } } },
    });
    const discount = redemption?.status === "RESERVED" ? redemption.discountAmount : 0;
    const expected = Math.round((DOCTOR_REGISTRATION_FEE - discount) * 100) / 100;
    if (payload.data.order.order_amount !== expected) {
      console.error(
        "Cashfree webhook amount mismatch for doctor registration", profile.id,
        "expected", expected, "got", payload.data.order.order_amount
      );
      return NextResponse.json({ ok: true });
    }
    const sixMonthsOut = new Date();
    sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
    await prisma.$transaction([
      prisma.doctorProfile.update({
        where: { id: profile.id },
        data: {
          registrationFeePaid: true,
          registrationFeeStatus: "PAID",
          cashfreePaymentId: payload.data.payment.cf_payment_id,
          // First-time-only free trial of patient-access — this only ever
          // fires once per doctor, at their one and only registration payment.
          trialEndsAt: sixMonthsOut,
        },
      }),
      prisma.doctorPaymentLog.create({
        data: {
          doctorId: profile.userId,
          type: "REGISTRATION",
          amount: payload.data.order.order_amount,
          couponCode: discount > 0 ? redemption?.coupon.code ?? null : null,
          discountAmount: discount,
          cashfreePaymentId: payload.data.payment.cf_payment_id,
        },
      }),
      prisma.couponRedemption.updateMany({
        where: { orderId, status: "RESERVED" },
        data: { status: "CONFIRMED" },
      }),
    ]);
    void sendPushToUser(profile.userId, {
      title: "Registration fee received",
      body: "Your application is now under review.",
      url: "/doctor/dashboard",
    });
    return NextResponse.json({ ok: true });
  }

  if (orderId.startsWith("docsub")) {
    const profile = await prisma.doctorProfile.findFirst({ where: { cashfreeOrderId: orderId } });
    if (!profile) {
      console.error("Cashfree webhook: no doctor profile found for order", orderId);
      return NextResponse.json({ ok: true });
    }
    const redemption = await prisma.couponRedemption.findUnique({
      where: { orderId },
      include: { coupon: { select: { code: true } } },
    });
    const discount = redemption?.status === "RESERVED" ? redemption.discountAmount : 0;
    const expected = Math.round((DOCTOR_SUBSCRIPTION_FEE - discount) * 100) / 100;
    if (payload.data.order.order_amount !== expected) {
      console.error(
        "Cashfree webhook amount mismatch for doctor subscription", profile.id,
        "expected", expected, "got", payload.data.order.order_amount
      );
      return NextResponse.json({ ok: true });
    }
    // Extend from whichever is later — "now" for a lapsed renewal, or the
    // current paid-until date for someone renewing early — so early renewal
    // never loses time they already paid for.
    const now = Date.now();
    const currentPaidUntil = profile.subscriptionPaidUntil ? new Date(profile.subscriptionPaidUntil).getTime() : 0;
    const base = new Date(Math.max(now, currentPaidUntil));
    base.setMonth(base.getMonth() + 1);
    await prisma.$transaction([
      prisma.doctorProfile.update({
        where: { id: profile.id },
        data: {
          subscriptionPaidUntil: base,
          cashfreePaymentId: payload.data.payment.cf_payment_id,
        },
      }),
      prisma.doctorPaymentLog.create({
        data: {
          doctorId: profile.userId,
          type: "SUBSCRIPTION",
          amount: payload.data.order.order_amount,
          couponCode: discount > 0 ? redemption?.coupon.code ?? null : null,
          discountAmount: discount,
          cashfreePaymentId: payload.data.payment.cf_payment_id,
        },
      }),
      prisma.couponRedemption.updateMany({
        where: { orderId, status: "RESERVED" },
        data: { status: "CONFIRMED" },
      }),
    ]);
    void sendPushToUser(profile.userId, {
      title: "Subscription renewed",
      body: "Your subscription is active.",
      url: "/doctor/dashboard",
    });
    return NextResponse.json({ ok: true });
  }

  if (orderId.startsWith(WALLET_TOPUP_ORDER_PREFIX)) {
    const txn = await prisma.walletTransaction.findFirst({
      where: { cashfreeOrderId: orderId },
      include: { wallet: true },
    });
    if (!txn) {
      console.error("Cashfree webhook: no wallet transaction found for order", orderId);
      return NextResponse.json({ ok: true });
    }
    if (txn.status !== "PENDING") {
      // Already settled — Cashfree retries webhooks, this must be idempotent.
      return NextResponse.json({ ok: true });
    }
    if (payload.data.order.order_amount !== txn.amount) {
      console.error(
        "Cashfree webhook amount mismatch for wallet top-up", txn.id,
        "expected", txn.amount, "got", payload.data.order.order_amount
      );
      return NextResponse.json({ ok: true }); // don't credit; flagged for manual review
    }

    const wallet = await prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.update({
        where: { id: txn.walletId },
        data: { balance: { increment: txn.amount } },
      });
      await tx.walletTransaction.update({
        where: { id: txn.id },
        data: { status: "SUCCESS", balanceAfter: updated.balance, cashfreePaymentId: payload.data.payment.cf_payment_id },
      });
      return updated;
    });

    void sendPushToUser(txn.wallet.userId, {
      title: "Wallet top-up successful",
      body: `₹${txn.amount} added to your wallet. New balance ₹${wallet.balance}.`,
      url: "/patient/wallet",
    });
    return NextResponse.json({ ok: true });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { cashfreeOrderId: orderId },
    include: { patient: { select: { name: true } } },
  });
  if (!appointment) {
    console.error("Cashfree webhook: no appointment found for order", orderId);
    return NextResponse.json({ ok: true }); // ack anyway — nothing to retry into
  }

  // The order was created for the coupon-discounted amount, so that's what to
  // reconcile against — not the doctor's full fee.
  const expectedAmount = netPayable(appointment);
  if (payload.data.order.order_amount !== expectedAmount) {
    console.error(
      "Cashfree webhook amount mismatch for appointment", appointment.id,
      "expected", expectedAmount, "got", payload.data.order.order_amount
    );
    return NextResponse.json({ ok: true }); // don't mark paid; flagged above for manual review
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        paymentStatus: "PAID",
        paidAt: new Date(),
        cashfreePaymentId: payload.data.payment.cf_payment_id,
      },
    });
    await confirmCouponRedemption(tx, { appointmentId: appointment.id });
  });

  void sendPushToUser(appointment.doctorId, {
    title: "Payment received",
    body: `Payment received for your consultation with ${appointment.patient.name}.`,
    url: "/doctor/dashboard",
  });

  return NextResponse.json({ ok: true });
}
