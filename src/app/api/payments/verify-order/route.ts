import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { fetchSuccessfulPayment } from "@/lib/cashfree";
import { settleAppointmentPayment, notifySettlement } from "@/lib/paymentOrders";
import { createRateLimiter } from "@/lib/rateLimit";

// Each call can hit the Cashfree API once per open order.
const checkLimit = createRateLimiter(10, 60 * 1000);
// Older unsettled orders were abandoned checkouts; don't keep polling them.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

// POST { apptId }: the payment return page's fallback when the webhook is
// late or lost. Asks Cashfree directly whether any of this appointment's open
// orders was paid and, if so, settles it exactly as the webhook would.
// Responds with where the appointment's payment ended up.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { apptId } = await req.json().catch(() => ({}));
  if (typeof apptId !== "string" || !apptId) {
    return NextResponse.json({ error: "Missing apptId" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({ where: { id: apptId }, select: { patientId: true, paymentStatus: true } });
  if (!appointment || appointment.patientId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appointment.paymentStatus !== "PAID") {
    if (!checkLimit(authUser.id)) {
      return NextResponse.json({ error: "Too many checks. Please wait a moment." }, { status: 429 });
    }
    const open = await prisma.paymentOrder.findMany({
      where: {
        patientId: authUser.id,
        status: "CREATED",
        createdAt: { gt: new Date(Date.now() - LOOKBACK_MS) },
        items: { some: { appointmentId: apptId } },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    for (const order of open) {
      let payment;
      try {
        payment = await fetchSuccessfulPayment(order.orderId);
      } catch {
        return NextResponse.json({ error: "Couldn't reach the payment gateway. Please try again." }, { status: 502 });
      }
      if (!payment) continue;
      notifySettlement(
        await settleAppointmentPayment({ orderId: order.orderId, amount: payment.amount, cfPaymentId: payment.cfPaymentId, customerId: authUser.id })
      );
    }
  }

  return NextResponse.json(await paymentState(apptId));
}

// PAID, CREDITED (the payment went to the wallet instead — e.g. the visit was
// cancelled meanwhile), or PENDING (nothing received yet).
async function paymentState(apptId: string) {
  const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId }, select: { paymentStatus: true } });
  if (appt.paymentStatus === "PAID") return { paymentStatus: "PAID" as const };
  const credited = await prisma.paymentOrderItem.findFirst({
    where: { appointmentId: apptId, outcome: "CREDITED" },
    orderBy: { paymentOrder: { settledAt: "desc" } },
    select: { amount: true },
  });
  return credited
    ? { paymentStatus: "CREDITED" as const, creditedAmount: credited.amount }
    : { paymentStatus: "PENDING" as const };
}
