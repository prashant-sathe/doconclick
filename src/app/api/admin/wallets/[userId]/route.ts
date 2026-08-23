import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { getOrCreateWallet } from "@/lib/wallet";

// GET: one patient's wallet balance + full transaction history, for the
// admin drawer.
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, mobile: true, email: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wallet = await getOrCreateWallet(prisma, userId);
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    include: {
      admin: { select: { name: true } },
      appointment: { select: { id: true, doctor: { select: { name: true } } } },
    },
  });

  return NextResponse.json({ user, balance: wallet.balance, transactions });
}
