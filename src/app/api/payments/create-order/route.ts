import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder } from "@/lib/cashfree";
import { APPOINTMENT_ORDER_PREFIX, recordPaymentOrder, totalPayable, settleFreeAppointments, notifySettlement } from "@/lib/paymentOrders";
import { withErrorLocale } from "@/lib/apiErrors";

// POST: Creates a real Cashfree order for an appointment's online payment
// and returns a payment_session_id for the client to redirect into checkout.
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { appointmentId } = await req.json();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.patientId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.paymentMethod !== "ONLINE") {
    return NextResponse.json({ error: "This appointment is not set up for online payment" }, { status: 400 });
  }
  if (appointment.paymentStatus === "PAID") {
    return NextResponse.json({ error: "This appointment has already been paid for" }, { status: 400 });
  }
  // Only an accepted, still-live appointment can be charged. A package's
  // other visits are filtered to SCHEDULED below; if one is cancelled after
  // the order is created, the webhook credits its share to the wallet.
  if (appointment.status !== "SCHEDULED") {
    return NextResponse.json({ error: "This appointment is no longer active, so it can't be paid for." }, { status: 400 });
  }

  // A nurse package is one checkout for every accepted, unpaid visit.
  const covered = appointment.packageId
    ? await prisma.appointment.findMany({
        where: { packageId: appointment.packageId, status: "SCHEDULED", paymentStatus: { not: "PAID" }, paymentMethod: "ONLINE" },
      })
    : [appointment];
  if (covered.length === 0) {
    return NextResponse.json({ error: "Wait for the nurse to accept your visits before paying." }, { status: 400 });
  }

  // Nothing left to pay (a 100% coupon, or a ₹0 fee): Cashfree can't create a
  // ₹0 order, so settle without it — mark the visits PAID and tell the provider.
  if (totalPayable(covered) === 0) {
    const settled = await settleFreeAppointments(covered.map((a) => a.id), authUser.id);
    if (settled.paid.length === 0) {
      return NextResponse.json({ error: "This appointment can't be confirmed right now. Please refresh and try again." }, { status: 409 });
    }
    notifySettlement(settled);
    return NextResponse.json({ paid: true, free: true, visitsPaid: settled.paid.length });
  }

  const orderId = `${APPOINTMENT_ORDER_PREFIX}${appointment.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));

  // Recorded before checkout opens, with each visit's share, so the webhook
  // can settle *this* order even if the patient retries and creates another
  // (previously the retry overwrote Appointment.cashfreeOrderId and an
  // earlier order's payment was lost).
  const record = await recordPaymentOrder({ orderId, patientId: authUser.id, appointments: covered });

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount: record.amount,
      customerId: authUser.id,
      customerName: authUser.name,
      customerPhone: authUser.mobile,
      returnUrl: `${origin}/patient/payment/return?apptId=${appointment.id}`,
      notifyUrl: `${origin}/api/payments/webhook`,
    });

    return NextResponse.json({ paymentSessionId });
  } catch (err) {
    // No gateway order exists, so nothing can ever be paid against this one.
    await prisma.paymentOrder.delete({ where: { id: record.id } }).catch(() => {});
    console.error("Failed to create Cashfree order for appointment", appointment.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
});
