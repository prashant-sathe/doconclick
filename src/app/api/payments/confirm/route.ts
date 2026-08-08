import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// POST: Confirm payment for an appointment.
//
// This is a simulated/sandbox gateway — no real money moves. It exists as the
// single isolated integration point so swapping in a real provider (e.g.
// Razorpay order creation + webhook verification) later only touches this file.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { appointmentId, method } = await req.json();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.patientId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      paymentMethod: "ONLINE",
      paymentStatus: "PAID",
    },
  });

  return NextResponse.json({ ...updated, gatewayMethod: method ?? "UPI", simulated: true });
}
