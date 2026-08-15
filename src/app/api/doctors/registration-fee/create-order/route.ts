import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder, DOCTOR_REGISTRATION_FEE } from "@/lib/cashfree";

// POST: Creates a real Cashfree order for a doctor's one-time registration fee.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const profile = await prisma.doctorProfile.findUnique({ where: { userId: authUser.id } });
  if (!profile) {
    return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
  }
  if (profile.registrationFeePaid) {
    return NextResponse.json({ error: "Registration fee already paid" }, { status: 400 });
  }

  const orderId = `docreg${authUser.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount: DOCTOR_REGISTRATION_FEE,
      customerId: authUser.id,
      customerName: authUser.name,
      customerPhone: authUser.mobile,
      returnUrl: `${origin}/doctor/payment/return`,
      notifyUrl: `${origin}/api/payments/webhook`,
    });

    await prisma.doctorProfile.update({
      where: { userId: authUser.id },
      data: { cashfreeOrderId: orderId },
    });

    return NextResponse.json({ paymentSessionId });
  } catch (err) {
    console.error("Failed to create Cashfree order for doctor registration fee", authUser.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
