import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { fetchSuccessfulPayment } from "@/lib/cashfree";
import { bookingIdFromOrder, settleLabPayment } from "@/lib/labBookings";
import { notifyLabSettled } from "@/lib/labNotify";
import { createRateLimiter } from "@/lib/rateLimit";
import { withErrorLocale } from "@/lib/apiErrors";

const checkLimit = createRateLimiter(20, 60_000);

// POST { orderId }: the lab tests page's fallback when it comes back from
// Cashfree before the webhook — asks the gateway and settles exactly as the
// webhook would. Answers PAID, CREDITED (went to the wallet) or PENDING.
export const POST = withErrorLocale(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;
  const { id } = await params;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId || bookingIdFromOrder(orderId) !== id) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  const booking = await prisma.labBooking.findUnique({ where: { id } });
  if (!booking || booking.patientId !== authUser.id) return NextResponse.json({ error: "Lab booking not found" }, { status: 404 });

  if (booking.paymentStatus !== "PENDING") return NextResponse.json({ status: "PAID" });
  if (!checkLimit(authUser.id)) return NextResponse.json({ error: "Too many checks. Please wait a moment." }, { status: 429 });
  let payment;
  try {
    payment = await fetchSuccessfulPayment(orderId);
  } catch {
    return NextResponse.json({ error: "Couldn't reach the payment gateway. Please try again." }, { status: 502 });
  }
  if (!payment) return NextResponse.json({ status: "PENDING" });
  const result = await settleLabPayment({ orderId, ...payment });
  notifyLabSettled(result);
  const now = await prisma.labBooking.findUniqueOrThrow({ where: { id }, select: { paymentStatus: true } });
  return NextResponse.json({ status: now.paymentStatus === "PAID" ? "PAID" : result.outcome === "credited" ? "CREDITED" : "PENDING" });
});
