import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder } from "@/lib/cashfree";
import { UNSETTLED_WHERE, duesFor } from "@/lib/payouts";
import { DUES_ORDER_PREFIX, owedByDoctor } from "@/lib/duesPayments";
import { createRateLimiter } from "@/lib/rateLimit";

const checkLimit = createRateLimiter(10, 10 * 60_000);

// POST { returnTo? }: a Cashfree order for everything the doctor owes right
// now. Open to a doctor whose plan has lapsed — paying dues needs no plan. The visits
// it covers are snapshotted, so the payment settles exactly those
// (src/lib/duesPayments.ts) even if more are completed before it lands.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!checkLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  // Where Cashfree sends them back: Earnings, or Subscribe for a doctor whose
  // plan has lapsed (Earnings redirects them away).
  const { returnTo } = await req.json().catch(() => ({}));
  const returnPath = returnTo === "subscribe" ? "/doctor/subscribe" : "/doctor/earnings";

  const rows = await prisma.appointment.findMany({ where: { ...UNSETTLED_WHERE, doctorId: authUser.id }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  const owed = ids.length ? owedByDoctor(await duesFor({ id: { in: ids }, ...UNSETTLED_WHERE })) : 0;
  if (owed <= 0) {
    return NextResponse.json({ error: "You don't owe anything right now." }, { status: 400 });
  }
  // Cashfree's smallest order.
  if (owed < 1) {
    return NextResponse.json({ error: `₹${owed} is below the minimum online payment — it'll be settled with your next payout.` }, { status: 400 });
  }

  const orderId = `${DUES_ORDER_PREFIX}${authUser.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));
  const record = await prisma.duesPayment.create({
    data: { orderId, doctorId: authUser.id, amount: owed, appointmentIds: JSON.stringify(ids) },
  });

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount: owed,
      customerId: authUser.id,
      customerName: authUser.name,
      customerPhone: authUser.mobile,
      returnUrl: `${origin}${returnPath}?duesOrder=${encodeURIComponent(orderId)}`,
      notifyUrl: `${origin}/api/payments/webhook`,
    });
    return NextResponse.json({ paymentSessionId, amount: owed });
  } catch (err) {
    await prisma.duesPayment.delete({ where: { id: record.id } }).catch(() => {});
    console.error("Failed to create Cashfree order for doctor dues", authUser.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
