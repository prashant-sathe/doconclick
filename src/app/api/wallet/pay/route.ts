import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { getOrCreateWallet } from "@/lib/wallet";
import { netPayable, confirmCouponRedemption } from "@/lib/coupons";

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

  // A nurse package is paid in one go: every accepted, unpaid visit in it.
  const targetIds = appointment.packageId
    ? (await prisma.appointment.findMany({
        where: { packageId: appointment.packageId, status: "SCHEDULED", paymentStatus: { not: "PAID" }, paymentMethod: "ONLINE" },
        select: { id: true },
        orderBy: { scheduledAt: "asc" },
      })).map((a) => a.id)
    : [appointment.id];
  if (targetIds.length === 0) {
    return NextResponse.json({ error: "Wait for the nurse to accept your visits before paying." }, { status: 400 });
  }

  await getOrCreateWallet(prisma, authUser.id);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.appointment.findMany({ where: { id: { in: targetIds } } });
      if (fresh.length === 0 || fresh.some((a) => a.paymentStatus === "PAID")) throw new Error("ALREADY_PAID");

      // What the patient actually pays — the fee less any coupon discount
      // the platform is absorbing (summed across a package's visits).
      const payable = Math.round(fresh.reduce((sum, a) => sum + netPayable(a), 0) * 100) / 100;

      // Guarded conditional update instead of read-then-write: a double-click
      // or two concurrent requests must not both pass a balance check before
      // either commits. If the WHERE clause doesn't match, count is 0.
      const decremented = await tx.wallet.updateMany({
        where: { userId: authUser.id, balance: { gte: payable } },
        data: { balance: { decrement: payable } },
      });
      if (decremented.count === 0) throw new Error("INSUFFICIENT_BALANCE");

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: authUser.id } });
      // One ledger row per visit (walletTransaction.appointmentId is unique),
      // with the running balance stepping down to the final one.
      let running = wallet.balance + payable;
      let updatedAppt = null;
      for (const a of fresh) {
        const part = netPayable(a);
        running = Math.round((running - part) * 100) / 100;
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: "BOOKING_PAYMENT",
            amount: part,
            balanceAfter: running,
            status: "SUCCESS",
            appointmentId: a.id,
          },
        });
        const u = await tx.appointment.update({
          where: { id: a.id },
          data: { paymentStatus: "PAID", paidAt: new Date() },
        });
        if (a.id === appointment.id) updatedAppt = u;
        await confirmCouponRedemption(tx, { appointmentId: a.id });
      }

      return { wallet, updatedAppt, payable, count: fresh.length };
    });

    void sendPushToUser(authUser.id, {
      title: "Wallet debited",
      body: result.count > 1
        ? `₹${result.payable} deducted for your ${result.count}-visit package. New balance ₹${result.wallet.balance}.`
        : `₹${result.payable} deducted for your appointment. New balance ₹${result.wallet.balance}.`,
      url: "/patient/wallet",
    });
    void sendPushToUser(appointment.doctorId, {
      title: "Payment received",
      body: appointment.providerType === "NURSE"
        ? result.count > 1
          ? `${authUser.name} paid for all ${result.count} ${appointment.serviceName ?? "home"} visits.`
          : `${authUser.name} paid for the ${appointment.serviceName ?? "home"} visit — you can complete it once you're done.`
        : `Payment received for your consultation with ${authUser.name}.`,
      url: appointment.providerType === "NURSE" ? "/nurse/dashboard" : "/doctor/dashboard",
    });

    return NextResponse.json({ appointment: result.updatedAppt, walletBalance: result.wallet.balance, visitsPaid: result.count });
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
