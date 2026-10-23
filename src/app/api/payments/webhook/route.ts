import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCashfreeWebhookSignature, DOCTOR_SUBSCRIPTION_FEE } from "@/lib/cashfree";
import { getDoctorRegistrationFee, activateRegistration } from "@/lib/doctorFees";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { WALLET_TOPUP_ORDER_PREFIX } from "@/lib/wallet";
import { releaseCouponRedemption } from "@/lib/coupons";
import { settleAppointmentPayment, notifySettlement } from "@/lib/paymentOrders";
import { NURSE_REGISTRATION_ORDER_PREFIX, NURSE_SUBSCRIPTION_ORDER_PREFIX } from "@/lib/nurseConstants";
import { DUES_ORDER_PREFIX, settleDuesPayment, notifyDuesSettled } from "@/lib/duesPayments";

interface CashfreeWebhookPayload {
  type: "PAYMENT_SUCCESS_WEBHOOK" | "PAYMENT_FAILED_WEBHOOK" | string;
  event_time: string;
  data: {
    order: { order_id: string; order_amount: number };
    payment: { cf_payment_id: string; payment_status: string };
    customer_details?: { customer_id?: string };
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
          key: "walletTopupFailed",
          values: { amount: txn.amount },
          url: "/patient/wallet",
        });
      }
    }
    if (failedOrderId?.startsWith(DUES_ORDER_PREFIX)) {
      await prisma.duesPayment.updateMany({ where: { orderId: failedOrderId, status: "CREATED" }, data: { status: "FAILED" } });
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
  // A doctor paying the commission they owe on cash visits.
  if (orderId.startsWith(DUES_ORDER_PREFIX)) {
    const result = await settleDuesPayment({
      orderId,
      amount: payload.data.order.order_amount,
      cfPaymentId: payload.data.payment.cf_payment_id,
    });
    if (result.outcome === "unknown") console.error("Cashfree webhook: no dues payment found for order", orderId);
    notifyDuesSettled(result);
    return NextResponse.json({ ok: true });
  }

  if (orderId.startsWith("docreg")) {
    const profile = await prisma.doctorProfile.findFirst({ where: { cashfreeOrderId: orderId } });
    if (!profile) {
      console.error("Cashfree webhook: no doctor profile found for order", orderId);
      return NextResponse.json({ ok: true });
    }
    // Cashfree retries webhooks — a second delivery must not log the
    // payment (or restart the trial) twice.
    if (profile.registrationFeePaid) return NextResponse.json({ ok: true });
    const redemption = await prisma.couponRedemption.findUnique({
      where: { orderId },
      include: { coupon: { select: { code: true } } },
    });
    const discount = redemption?.status === "RESERVED" ? redemption.discountAmount : 0;
    // The amount this order was created for (the fee is admin-editable, so
    // never "today's fee"); orders from before that was recorded fall back to
    // the current fee.
    const expected = profile.registrationOrderAmount ?? Math.round(((await getDoctorRegistrationFee()) - discount) * 100) / 100;
    if (payload.data.order.order_amount !== expected) {
      console.error(
        "Cashfree webhook amount mismatch for doctor registration", profile.id,
        "expected", expected, "got", payload.data.order.order_amount
      );
      return NextResponse.json({ ok: true });
    }
    await activateRegistration(profile, {
      amount: payload.data.order.order_amount,
      discount,
      couponCode: redemption?.coupon.code ?? null,
      cashfreePaymentId: payload.data.payment.cf_payment_id,
      orderId,
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
    void sendPushToUser(profile.userId, { key: "subscriptionRenewed", url: "/doctor/dashboard" });
    return NextResponse.json({ ok: true });
  }

  if (orderId.startsWith(NURSE_REGISTRATION_ORDER_PREFIX) || orderId.startsWith(NURSE_SUBSCRIPTION_ORDER_PREFIX)) {
    const isRegistration = orderId.startsWith(NURSE_REGISTRATION_ORDER_PREFIX);
    const profile = await prisma.nurseProfile.findFirst({ where: { cashfreeOrderId: orderId } });
    if (!profile) {
      console.error("Cashfree webhook: no nurse profile found for order", orderId);
      return NextResponse.json({ ok: true });
    }
    // Already applied (Cashfree retries) — the payment id is set on success.
    if (profile.cashfreePaymentId === payload.data.payment.cf_payment_id) {
      return NextResponse.json({ ok: true });
    }
    if (profile.pendingOrderAmount == null || payload.data.order.order_amount !== profile.pendingOrderAmount) {
      console.error(
        "Cashfree webhook amount mismatch for nurse fee", profile.id,
        "expected", profile.pendingOrderAmount, "got", payload.data.order.order_amount
      );
      return NextResponse.json({ ok: true });
    }
    const now = Date.now();
    const currentPaidUntil = profile.subscriptionPaidUntil ? new Date(profile.subscriptionPaidUntil).getTime() : 0;
    const paidUntil = new Date(Math.max(now, currentPaidUntil));
    paidUntil.setMonth(paidUntil.getMonth() + 1);
    await prisma.$transaction([
      prisma.nurseProfile.update({
        where: { id: profile.id },
        data: {
          ...(isRegistration ? { registrationFeePaid: true } : { subscriptionPaidUntil: paidUntil }),
          cashfreePaymentId: payload.data.payment.cf_payment_id,
          pendingOrderAmount: null,
        },
      }),
      prisma.nursePaymentLog.create({
        data: {
          nurseId: profile.userId,
          type: isRegistration ? "REGISTRATION" : "SUBSCRIPTION",
          amount: payload.data.order.order_amount,
          cashfreePaymentId: payload.data.payment.cf_payment_id,
        },
      }),
    ]);
    void sendPushToUser(profile.userId, isRegistration
      ? { key: "registrationFeeReceived", url: "/nurse/profile" }
      : { key: "subscriptionRenewed", url: "/nurse/dashboard" });
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
      key: "walletTopupSuccess",
      values: { amount: txn.amount, balance: wallet.balance },
      url: "/patient/wallet",
    });
    return NextResponse.json({ ok: true });
  }

  // Everything else is an appointment order. Settlement applies what it can
  // and credits the rest — orphaned, mismatched, duplicate or no-longer-
  // SCHEDULED payments — to the patient's wallet, idempotently per payment.
  const result = await settleAppointmentPayment({
    orderId,
    amount: payload.data.order.order_amount,
    cfPaymentId: String(payload.data.payment.cf_payment_id),
    customerId: payload.data.customer_details?.customer_id,
  });
  notifySettlement(result);

  return NextResponse.json({ ok: true });
}
