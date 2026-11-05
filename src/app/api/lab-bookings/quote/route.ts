import { NextResponse } from "next/server";
import { requireRole } from "@/lib/routeGuards";
import { LabBookingError, labBookingQuote } from "@/lib/labBookings";
import { withErrorLocale } from "@/lib/apiErrors";

// GET ?appointmentId= : what the booking page needs — the prescription's
// tests with prices, any open booking, wallet balance, the profile address.
export const GET = withErrorLocale(async function GET(req: Request) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;
  const appointmentId = new URL(req.url).searchParams.get("appointmentId");
  if (!appointmentId) return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  try {
    return NextResponse.json(await labBookingQuote(authUser.id, appointmentId));
  } catch (err) {
    if (err instanceof LabBookingError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
});
