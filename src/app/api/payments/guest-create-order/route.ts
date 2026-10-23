import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder } from "@/lib/cashfree";
import { verifyGuestPaymentToken, guestPaymentPath } from "@/lib/guestPaymentToken";
import { APPOINTMENT_ORDER_PREFIX, recordPaymentOrder, totalPayable, settleFreeAppointments, notifySettlement } from "@/lib/paymentOrders";
import { createRateLimiter } from "@/lib/rateLimit";
import { withErrorLocale } from "@/lib/apiErrors";

// Each call opens a gateway order; a patient retrying checkout needs a few.
const checkLimit = createRateLimiter(10, 10 * 60_000);

// POST { token }: create-order for the pay link (/pay/[id]) — the same
// Cashfree order, recorded the same way, so the existing webhook settles it
// with no idea who opened it. The token stands in for the patient's session
// and only ever covers its own appointment.
export const POST = withErrorLocale(async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}));
  const apptId = verifyGuestPaymentToken(token);
  if (!apptId) {
    return NextResponse.json({ error: "This payment link has expired. Ask the clinic for a new one.", code: "LINK_EXPIRED" }, { status: 401 });
  }
  if (!checkLimit(apptId)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: apptId },
    include: { patient: { select: { id: true, name: true, mobile: true, email: true } } },
  });
  if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (appointment.paymentStatus === "PAID") {
    return NextResponse.json({ error: "This appointment has already been paid for." }, { status: 400 });
  }
  if (appointment.paymentMethod !== "ONLINE") {
    return NextResponse.json({ error: "The clinic has set this visit to be paid in cash." }, { status: 400 });
  }
  if (appointment.status !== "SCHEDULED") {
    return NextResponse.json({ error: "This appointment is no longer active, so it can't be paid for." }, { status: 400 });
  }

  const patientId = appointment.patientId;
  if (totalPayable([appointment]) === 0) {
    const settled = await settleFreeAppointments([appointment.id], patientId);
    if (settled.paid.length === 0) {
      return NextResponse.json({ error: "This appointment can't be confirmed right now. Please refresh and try again." }, { status: 409 });
    }
    notifySettlement(settled);
    return NextResponse.json({ paid: true, free: true });
  }

  const orderId = `${APPOINTMENT_ORDER_PREFIX}${appointment.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));
  const record = await recordPaymentOrder({ orderId, patientId, appointments: [appointment] });

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount: record.amount,
      customerId: patientId,
      customerName: appointment.patient.name.trim() || "Patient",
      customerPhone: appointment.patient.mobile,
      customerEmail: appointment.patient.email,
      returnUrl: `${origin}${guestPaymentPath(appointment.id, token, "return")}`,
      notifyUrl: `${origin}/api/payments/webhook`,
    });
    return NextResponse.json({ paymentSessionId });
  } catch (err) {
    await prisma.paymentOrder.delete({ where: { id: record.id } }).catch(() => {});
    console.error("Failed to create Cashfree order for guest payment", appointment.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
});
