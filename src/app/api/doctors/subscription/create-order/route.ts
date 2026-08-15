import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder, DOCTOR_SUBSCRIPTION_FEE } from "@/lib/cashfree";
import { hasActiveDoctorSubscription } from "@/lib/subscription";

// POST: Creates a real Cashfree order to renew a doctor's monthly
// patient-access subscription.
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

  const orderId = `docsub${authUser.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount: DOCTOR_SUBSCRIPTION_FEE,
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
    console.error("Failed to create Cashfree order for doctor subscription renewal", authUser.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
