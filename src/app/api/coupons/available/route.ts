import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { listPublicCouponsForAppointment } from "@/lib/coupons";
import { withErrorLocale } from "@/lib/apiErrors";

// GET ?appointmentId=…: public coupons the patient can tap to apply on
// /patient/payment. Read-only — POST /api/coupons/apply stays the authority
// (it re-validates and reserves the slot).
export const GET = withErrorLocale(async function GET(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const appointmentId = req.nextUrl.searchParams.get("appointmentId");
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, patientId: true, amount: true, consultType: true, status: true, paymentMethod: true, paymentStatus: true },
  });
  if (!appointment || appointment.patientId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  // Same window the apply route accepts; outside it there's nothing to offer.
  if (
    appointment.status !== "SCHEDULED" ||
    appointment.paymentMethod !== "ONLINE" ||
    appointment.paymentStatus === "PAID" ||
    appointment.amount <= 0
  ) {
    return NextResponse.json({ coupons: [] });
  }

  const coupons = await listPublicCouponsForAppointment(prisma, { appointment, userId: authUser.id });
  return NextResponse.json({ coupons });
});
