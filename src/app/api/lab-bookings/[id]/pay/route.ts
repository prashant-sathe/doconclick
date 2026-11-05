import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/routeGuards";
import { startLabCheckout } from "@/lib/labCheckout";
import { createRateLimiter } from "@/lib/rateLimit";
import { withErrorLocale } from "@/lib/apiErrors";

const checkLimit = createRateLimiter(10, 10 * 60_000);

// POST: a fresh Cashfree checkout for the patient's own unpaid online lab booking.
export const POST = withErrorLocale(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;
  const { id } = await params;
  const booking = await prisma.labBooking.findUnique({ where: { id } });
  if (!booking || booking.patientId !== authUser.id) return NextResponse.json({ error: "Lab booking not found" }, { status: 404 });
  if (booking.status !== "PENDING_PAYMENT") return NextResponse.json({ error: "This lab booking doesn't need a payment." }, { status: 409 });
  if (!checkLimit(authUser.id)) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  try {
    return NextResponse.json(await startLabCheckout(req, authUser, booking));
  } catch (err) {
    console.error("Failed to create Cashfree order for lab booking", booking.id, err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
});
