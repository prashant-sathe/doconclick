import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { externalOrigin } from "@/lib/googleOAuth";
import { createCashfreeOrder } from "@/lib/cashfree";
import { getOrCreateWallet, WALLET_TOPUP_ORDER_PREFIX, MIN_TOPUP_AMOUNT, MAX_TOPUP_AMOUNT } from "@/lib/wallet";

// POST: Creates a real Cashfree order for a wallet top-up and returns a
// payment_session_id for the client to redirect into checkout. Mirrors
// /api/payments/create-order for appointments.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { amount } = await req.json();
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < MIN_TOPUP_AMOUNT || amount > MAX_TOPUP_AMOUNT) {
    return NextResponse.json({ error: `Amount must be between ₹${MIN_TOPUP_AMOUNT} and ₹${MAX_TOPUP_AMOUNT}` }, { status: 400 });
  }

  const wallet = await getOrCreateWallet(prisma, authUser.id);

  // Create the ledger row first (PENDING) so the webhook has something to
  // find by orderId once Cashfree calls back.
  const txn = await prisma.walletTransaction.create({
    data: { walletId: wallet.id, type: "TOPUP", amount, status: "PENDING" },
  });

  const orderId = `${WALLET_TOPUP_ORDER_PREFIX}${txn.id}_${Date.now()}`;
  const origin = externalOrigin(req, new URL(req.url));

  try {
    const { paymentSessionId } = await createCashfreeOrder({
      orderId,
      amount,
      customerId: authUser.id,
      customerName: authUser.name,
      customerPhone: authUser.mobile,
      returnUrl: `${origin}/patient/wallet/topup/return?txnId=${txn.id}`,
      notifyUrl: `${origin}/api/payments/webhook`,
    });

    await prisma.walletTransaction.update({
      where: { id: txn.id },
      data: { cashfreeOrderId: orderId },
    });

    return NextResponse.json({ paymentSessionId, txnId: txn.id });
  } catch (err) {
    console.error("Failed to create Cashfree order for wallet top-up", txn.id, err);
    await prisma.walletTransaction.update({ where: { id: txn.id }, data: { status: "FAILED" } });
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
