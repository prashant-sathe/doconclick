import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/routeGuards";
import { sendPushToAdmins } from "@/lib/firebaseAdmin";
import { cancelLabBooking, patientLabBookingView } from "@/lib/labBookings";
import { withErrorLocale } from "@/lib/apiErrors";

// POST: the patient cancels their own booking while it's unpaid or still
// REQUESTED. A payment (wallet or online) is refunded to the wallet.
export const POST = withErrorLocale(async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;
  const { id } = await params;
  const booking = await prisma.labBooking.findUnique({ where: { id }, select: { patientId: true, status: true } });
  if (!booking || booking.patientId !== authUser.id) return NextResponse.json({ error: "Lab booking not found" }, { status: 404 });

  const result = await cancelLabBooking(id, { role: "PATIENT", patientId: authUser.id });
  if (!result) return NextResponse.json({ error: "This booking is already being processed — contact support to cancel it." }, { status: 409 });
  // An unpaid checkout never reached the admins — nothing to tell them.
  if (booking.status !== "PENDING_PAYMENT") {
    void sendPushToAdmins({ key: "labBookingCancelledByPatient", values: { patient: result.booking.patientName }, url: "/admin/lab-bookings" });
  }
  const full = await prisma.labBooking.findUniqueOrThrow({ where: { id }, include: { items: true, reports: true } });
  return NextResponse.json({ ...patientLabBookingView(full), refunded: result.refunded });
});
