import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { fetchSuccessfulPayment } from "@/lib/cashfree";
import { settleDuesPayment, notifyDuesSettled } from "@/lib/duesPayments";
import { createRateLimiter } from "@/lib/rateLimit";
import { withErrorLocale } from "@/lib/apiErrors";

const checkLimit = createRateLimiter(10, 60_000);

// POST { orderId }: the earnings page's fallback when it comes back from
// Cashfree before the webhook — asks the gateway and settles exactly as the
// webhook would. Answers SETTLED, REVIEW (paid, waiting on the admin) or
// PENDING (nothing received yet).
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { orderId } = await req.json().catch(() => ({}));
  if (typeof orderId !== "string" || !orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

  let order = await prisma.duesPayment.findUnique({ where: { orderId } });
  if (!order || order.doctorId !== authUser.id) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  if (order.status !== "PAID") {
    if (!checkLimit(authUser.id)) return NextResponse.json({ error: "Too many checks. Please wait a moment." }, { status: 429 });
    let payment;
    try {
      payment = await fetchSuccessfulPayment(orderId);
    } catch {
      return NextResponse.json({ error: "Couldn't reach the payment gateway. Please try again." }, { status: 502 });
    }
    if (payment) notifyDuesSettled(await settleDuesPayment({ orderId, ...payment }));
    order = await prisma.duesPayment.findUniqueOrThrow({ where: { orderId } });
  }

  return NextResponse.json({
    status: order.settlementId ? "SETTLED" : order.status === "PAID" ? "REVIEW" : "PENDING",
    amount: order.amount,
  });
});
