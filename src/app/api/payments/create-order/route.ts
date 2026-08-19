import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder } from "@/lib/cashfree";

// POST: Creates a real Cashfree order for an appointment's online payment
// and returns a payment_session_id for the client to redirect into checkout.
export async function POST(req: Request) {
  const authUser = await getAuthUserAny(req);
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

  const orderId = `appt${appointment.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount: appointment.amount,
      customerId: authUser.id,
      customerName: authUser.name,
      customerPhone: authUser.mobile,
      returnUrl: `${origin}/patient/payment/return?apptId=${appointment.id}`,
      notifyUrl: `${origin}/api/payments/webhook`,
    });

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { cashfreeOrderId: orderId },
    });

    // orderId is additive — web's checkout page only reads paymentSessionId
    // from this response, so returning it too doesn't change web behavior.
    return NextResponse.json({ paymentSessionId, orderId });
  } catch (err) {
    console.error("Failed to create Cashfree order for appointment", appointment.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
