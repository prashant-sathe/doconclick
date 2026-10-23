import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder } from "@/lib/cashfree";
import { requireActiveNurse } from "@/lib/providerGuard";
import { NURSE_REGISTRATION_ORDER_PREFIX, NURSE_SUBSCRIPTION_ORDER_PREFIX } from "@/lib/nurseConstants";
import { withErrorLocale } from "@/lib/apiErrors";

// POST { kind: "REGISTRATION" | "SUBSCRIPTION" } — creates a Cashfree order
// for the admin-set nurse fee. A fee of ₹0 means that step doesn't exist, so
// there's nothing to pay for.
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "NURSE") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = await requireActiveNurse(authUser);
  if (denied) return denied;

  const { kind } = await req.json().catch(() => ({}));
  if (kind !== "REGISTRATION" && kind !== "SUBSCRIPTION") {
    return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
  }

  const [profile, settings] = await Promise.all([
    prisma.nurseProfile.findUnique({ where: { userId: authUser.id } }),
    prisma.platformSettings.findFirst(),
  ]);
  if (!profile) return NextResponse.json({ error: "Nurse profile not found" }, { status: 404 });

  const amount = kind === "REGISTRATION" ? settings?.nurseRegistrationFee ?? 0 : settings?.nurseSubscriptionFee ?? 0;
  if (amount <= 0) {
    return NextResponse.json({ error: "There's nothing to pay — this fee is currently free." }, { status: 400 });
  }
  if (kind === "REGISTRATION" && profile.registrationFeePaid) {
    return NextResponse.json({ error: "Registration fee already paid" }, { status: 400 });
  }
  if (kind === "SUBSCRIPTION" && (settings?.nurseRegistrationFee ?? 0) > 0 && !profile.registrationFeePaid) {
    return NextResponse.json({ error: "Please pay the registration fee first." }, { status: 400 });
  }

  const prefix = kind === "REGISTRATION" ? NURSE_REGISTRATION_ORDER_PREFIX : NURSE_SUBSCRIPTION_ORDER_PREFIX;
  const orderId = `${prefix}${authUser.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount,
      customerId: authUser.id,
      customerName: authUser.name,
      customerPhone: authUser.mobile,
      returnUrl: `${origin}/nurse/profile?payment=done`,
      notifyUrl: `${origin}/api/payments/webhook`,
    });
    await prisma.nurseProfile.update({
      where: { userId: authUser.id },
      data: { cashfreeOrderId: orderId, pendingOrderAmount: amount },
    });
    return NextResponse.json({ paymentSessionId });
  } catch (err) {
    console.error("Failed to create Cashfree order for nurse fee", authUser.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
});
