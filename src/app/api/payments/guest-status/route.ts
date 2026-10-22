import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchSuccessfulPayment } from "@/lib/cashfree";
import { verifyGuestPaymentToken } from "@/lib/guestPaymentToken";
import { settleAppointmentPayment, notifySettlement } from "@/lib/paymentOrders";
import { netPayable } from "@/lib/coupons";
import { createRateLimiter } from "@/lib/rateLimit";

// `verify` asks Cashfree directly, once per open order — keep it rare.
const checkVerifyLimit = createRateLimiter(10, 60 * 1000);
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

// GET ?t=<token>[&verify=1]: what the pay link (/pay/[id]) shows — the bill
// and whether it's paid — for a caller with no session. `verify=1` is the
// return page's fallback when the webhook is late: settle any of this
// appointment's open orders Cashfree says were paid, exactly as
// /api/payments/verify-order does for a signed-in patient.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const apptId = verifyGuestPaymentToken(params.get("t"));
  if (!apptId) {
    return NextResponse.json({ error: "This payment link has expired. Ask the clinic for a new one.", code: "LINK_EXPIRED" }, { status: 401 });
  }

  const load = () =>
    prisma.appointment.findUnique({
      where: { id: apptId },
      select: {
        id: true, patientId: true, status: true, consultType: true, scheduledAt: true, createdAt: true,
        amount: true, discountAmount: true, paymentMethod: true, paymentStatus: true,
        patientName: true, relation: true,
        patient: { select: { name: true } },
        doctor: { select: { name: true, doctorProfile: { select: { specialty: true } } } },
        clinic: { select: { name: true, address: true } },
      },
    });
  let appt = await load();
  if (!appt) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  if (params.get("verify") === "1" && appt.paymentStatus !== "PAID") {
    if (!checkVerifyLimit(apptId)) {
      return NextResponse.json({ error: "Too many checks. Please wait a moment." }, { status: 429 });
    }
    const open = await prisma.paymentOrder.findMany({
      where: {
        patientId: appt.patientId,
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
        await settleAppointmentPayment({ orderId: order.orderId, amount: payment.amount, cfPaymentId: payment.cfPaymentId, customerId: appt.patientId })
      );
    }
    appt = (await load())!;
  }

  // Paid, but to the patient's wallet instead (e.g. cancelled meanwhile).
  const credited = appt.paymentStatus === "PAID"
    ? null
    : await prisma.paymentOrderItem.findFirst({
        where: { appointmentId: apptId, outcome: "CREDITED" },
        orderBy: { paymentOrder: { settledAt: "desc" } },
        select: { amount: true },
      });

  return NextResponse.json({
    id: appt.id,
    status: appt.status,
    consultType: appt.consultType,
    scheduledAt: appt.scheduledAt,
    timed: appt.scheduledAt.getTime() > appt.createdAt.getTime(),
    patientName: appt.relation !== "Self" && appt.patientName ? appt.patientName : appt.patient.name,
    doctorName: appt.doctor.name,
    specialty: appt.doctor.doctorProfile?.specialty ?? null,
    clinic: appt.consultType === "CLINIC" ? appt.clinic : null,
    amount: appt.amount,
    discountAmount: appt.discountAmount,
    payable: netPayable(appt),
    paymentMethod: appt.paymentMethod,
    paymentStatus: appt.paymentStatus,
    creditedAmount: credited?.amount ?? null,
  });
}
