import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// GET: every patient's wallet balance, for the admin wallets list + summary
// stat cards. Patients who never topped up have no Wallet row yet — surface
// them too, at ₹0, so the list matches the full patient roster.
export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const wallets = await prisma.wallet.findMany({
    include: { user: { select: { id: true, name: true, mobile: true, email: true } } },
    orderBy: { balance: "desc" },
  });

  const walletedIds = new Set(wallets.map((w) => w.userId));
  const unwalleted = await prisma.user.findMany({
    where: { role: "PATIENT", deletedAt: null, id: { notIn: [...walletedIds] } },
    select: { id: true, name: true, mobile: true, email: true },
  });

  const rows = [
    ...wallets.map((w) => ({ userId: w.userId, name: w.user.name, mobile: w.user.mobile, email: w.user.email, balance: w.balance })),
    ...unwalleted.map((u) => ({ userId: u.id, name: u.name, mobile: u.mobile, email: u.email, balance: 0 })),
  ];
  const totalLiability = rows.reduce((s, r) => s + r.balance, 0);

  return NextResponse.json({ rows, totalLiability, walletedCount: wallets.length });
}
