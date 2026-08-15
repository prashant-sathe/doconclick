import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCashfreeWebhookSignature, DOCTOR_REGISTRATION_FEE } from "@/lib/cashfree";

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
    console.log("Cashfree payment failed for order", payload.data?.order?.order_id);
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
    if (payload.data.order.order_amount !== DOCTOR_REGISTRATION_FEE) {
      console.error(
        "Cashfree webhook amount mismatch for doctor registration", profile.id,
        "expected", DOCTOR_REGISTRATION_FEE, "got", payload.data.order.order_amount
      );
      return NextResponse.json({ ok: true });
    }
    await prisma.doctorProfile.update({
      where: { id: profile.id },
      data: {
        registrationFeePaid: true,
        registrationFeeStatus: "PAID",
        cashfreePaymentId: payload.data.payment.cf_payment_id,
      },
    });
    return NextResponse.json({ ok: true });
  }

  const appointment = await prisma.appointment.findFirst({ where: { cashfreeOrderId: orderId } });
  if (!appointment) {
    console.error("Cashfree webhook: no appointment found for order", orderId);
    return NextResponse.json({ ok: true }); // ack anyway — nothing to retry into
  }

  if (payload.data.order.order_amount !== appointment.amount) {
    console.error(
      "Cashfree webhook amount mismatch for appointment", appointment.id,
      "expected", appointment.amount, "got", payload.data.order.order_amount
    );
    return NextResponse.json({ ok: true }); // don't mark paid; flagged above for manual review
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      paymentStatus: "PAID",
      cashfreePaymentId: payload.data.payment.cf_payment_id,
    },
  });

  return NextResponse.json({ ok: true });
}
