import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: single wallet-transaction status lookup, polled by the top-up return
// page while it waits for the webhook to settle a PENDING top-up.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const txn = await prisma.walletTransaction.findUnique({
    where: { id },
    include: { wallet: true },
  });
  if (!txn || txn.wallet.userId !== authUser.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: txn.id,
    type: txn.type,
    status: txn.status,
    amount: txn.amount,
    balanceAfter: txn.balanceAfter,
    createdAt: txn.createdAt,
  });
}
