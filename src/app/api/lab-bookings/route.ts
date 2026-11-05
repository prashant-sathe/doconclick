import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { sendPushToAdmins, sendPushToUser } from "@/lib/firebaseAdmin";
import { createLabBooking, LabBookingError, parseLabBookingInput, patientLabBookingView } from "@/lib/labBookings";
import { startLabCheckout } from "@/lib/labCheckout";
import { createRateLimiter } from "@/lib/rateLimit";
import { withErrorLocale } from "@/lib/apiErrors";

const checkLimit = createRateLimiter(20, 10 * 60_000);

// GET: the patient's own lab bookings (with reports), newest first. Unpaid
// online bookings that were replaced by a newer one are left out.
export const GET = withErrorLocale(async function GET() {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;
  const bookings = await prisma.labBooking.findMany({
    where: { patientId: authUser.id, OR: [{ cancelledBy: null }, { cancelledBy: { not: "SYSTEM" } }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { items: true, reports: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(bookings.map(patientLabBookingView));
});

// POST: book prescription tests — { appointmentId, labTestIds, address, notes?, paymentMethod: WALLET | ONLINE }.
// ONLINE answers with a Cashfree paymentSessionId to open the checkout with.
export const POST = withErrorLocale(async function POST(req: Request) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;
  if (!checkLimit(authUser.id)) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const parsed = parseLabBookingInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  let booking;
  try {
    booking = await createLabBooking(authUser.id, parsed.data);
  } catch (err) {
    if (err instanceof LabBookingError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }

  if (booking.paymentMethod === "ONLINE") {
    try {
      const checkout = await startLabCheckout(req, authUser, booking);
      return NextResponse.json({ ...patientLabBookingView(booking), ...checkout });
    } catch (err) {
      console.error("Failed to create Cashfree order for lab booking", booking.id, err);
      await prisma.labBooking.updateMany({ where: { id: booking.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", cancelledBy: "SYSTEM" } });
      return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
    }
  }

  void sendPushToAdmins({
    key: "labBookingNew",
    values: { patient: booking.patientName, count: booking.items.length, amount: booking.totalAmount },
    url: "/admin/lab-bookings",
  });
  void sendPushToUser(authUser.id, { key: "labBookingPaidWallet", values: { amount: booking.totalAmount }, url: "/patient/lab-tests" });
  return NextResponse.json(patientLabBookingView(booking));
});
