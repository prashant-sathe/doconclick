import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { getOrCreateWallet } from "@/lib/wallet";

// POST: admin credits or debits a patient's wallet. A debit that would push
// the balance negative requires an explicit acknowledgement — same
// requiresAcknowledgement/409 pattern as /api/admin/finance/settlements.
export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const { userId } = await params;
  const { direction, amount, note, acknowledgeNegative } = await req.json();
  if (!["CREDIT", "DEBIT"].includes(direction) || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid adjustment" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wallet = await getOrCreateWallet(prisma, userId);

  if (direction === "DEBIT") {
    const resultingBalance = wallet.balance - amount;
    if (resultingBalance < 0 && acknowledgeNegative !== true) {
      return NextResponse.json(
        { requiresAcknowledgement: true, currentBalance: wallet.balance, resultingBalance },
        { status: 409 }
      );
    }
  }

  const { updatedWallet, txn } = await prisma.$transaction(async (tx) => {
    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: direction === "CREDIT" ? { increment: amount } : { decrement: amount } },
    });
    const txn = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: direction === "CREDIT" ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
        amount,
        balanceAfter: updatedWallet.balance,
        status: "SUCCESS",
        adminId: authUser.id,
        note: note || null,
      },
    });
    return { updatedWallet, txn };
  });

  void sendPushToUser(userId, {
    title: direction === "CREDIT" ? "Wallet credited" : "Wallet debited",
    body: `An admin ${direction === "CREDIT" ? "added" : "deducted"} ₹${amount} ${direction === "CREDIT" ? "to" : "from"} your wallet.${note ? ` Note: ${note}` : ""} New balance ₹${updatedWallet.balance}.`,
    url: "/patient/wallet",
  });

  return NextResponse.json({ balance: updatedWallet.balance, transaction: txn });
}
