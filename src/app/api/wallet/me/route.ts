import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getOrCreateWallet } from "@/lib/wallet";

// GET: current patient's wallet balance + a page of transaction history.
// Shared by the wallet page, header balance chip, and notification poller —
// `take=0` skips the transactions query for callers that only need balance.
export async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const take = Math.min(Math.max(Number(searchParams.get("take") ?? 20), 0), 50);
  const skip = Math.max(Number(searchParams.get("skip") ?? 0), 0);

  const wallet = await getOrCreateWallet(prisma, authUser.id);
  const transactions = take > 0
    ? await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      })
    : [];

  return NextResponse.json({ balance: wallet.balance, transactions });
}
