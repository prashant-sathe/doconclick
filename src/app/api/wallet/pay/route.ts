import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { getOrCreateWallet } from "@/lib/wallet";

// POST: pays an already-SCHEDULED appointment out of the patient's wallet
// balance. Unlike Cashfree, this is a direct authenticated server call with
// an immediate result — no external redirect, no webhook, no return page.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { appointmentId } = await req.json();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.patientId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.paymentMethod !== "ONLINE") {
    return NextResponse.json({ error: "This appointment is not set up for online payment" }, { status: 400 });
  }
  if (appointment.paymentStatus === "PAID") {
    return NextResponse.json({ error: "This appointment has already been paid for" }, { status: 400 });
  }

  await getOrCreateWallet(prisma, authUser.id);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const freshAppt = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!freshAppt || freshAppt.paymentStatus === "PAID") throw new Error("ALREADY_PAID");

      // Guarded conditional update instead of read-then-write: a double-click
      // or two concurrent requests must not both pass a balance check before
      // either commits. If the WHERE clause doesn't match, count is 0.
      const decremented = await tx.wallet.updateMany({
        where: { userId: authUser.id, balance: { gte: appointment.amount } },
        data: { balance: { decrement: appointment.amount } },
      });
      if (decremented.count === 0) throw new Error("INSUFFICIENT_BALANCE");

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: authUser.id } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "BOOKING_PAYMENT",
          amount: appointment.amount,
          balanceAfter: wallet.balance,
          status: "SUCCESS",
          appointmentId: appointment.id,
        },
      });
      const updatedAppt = await tx.appointment.update({
        where: { id: appointment.id },
        data: { paymentStatus: "PAID", paidAt: new Date() },
      });

      return { wallet, updatedAppt };
    });

    void sendPushToUser(authUser.id, {
      title: "Wallet debited",
      body: `₹${appointment.amount} deducted for your appointment. New balance ₹${result.wallet.balance}.`,
      url: "/patient/wallet",
    });
    void sendPushToUser(appointment.doctorId, {
      title: "Payment received",
      body: `Payment received for your consultation with ${authUser.name}.`,
      url: "/doctor/dashboard",
    });

    return NextResponse.json({ appointment: result.updatedAppt, walletBalance: result.wallet.balance });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
    }
    if (err instanceof Error && err.message === "ALREADY_PAID") {
      return NextResponse.json({ error: "This appointment has already been paid for" }, { status: 400 });
    }
    console.error("Failed to pay appointment from wallet", appointmentId, err);
    return NextResponse.json({ error: "Could not complete payment. Please try again." }, { status: 500 });
  }
}
