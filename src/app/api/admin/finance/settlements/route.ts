import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

const PENDING_WHERE = { status: "COMPLETED", paymentStatus: "PAID", settlementId: null } as const;

async function pendingTotalsForDoctor(doctorId: string) {
  const grouped = await prisma.appointment.groupBy({
    by: ["paymentMethod"],
    where: { ...PENDING_WHERE, doctorId },
    _sum: { amount: true, platformFee: true },
    _count: true,
  });

  let cashCount = 0;
  let onlineCount = 0;
  let cashFeeOwed = 0;
  let onlinePayoutOwed = 0;

  for (const g of grouped) {
    if (g.paymentMethod === "CASH") {
      cashCount = g._count;
      cashFeeOwed = g._sum.platformFee ?? 0;
    } else if (g.paymentMethod === "ONLINE") {
      onlineCount = g._count;
      onlinePayoutOwed = (g._sum.amount ?? 0) - (g._sum.platformFee ?? 0);
    }
  }

  return { cashCount, onlineCount, cashFeeOwed, onlinePayoutOwed, netAmount: onlinePayoutOwed - cashFeeOwed };
}

// GET: the settle queue — every doctor with at least one pending appointment
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const grouped = await prisma.appointment.groupBy({
    by: ["doctorId", "paymentMethod"],
    where: PENDING_WHERE,
    _sum: { amount: true, platformFee: true },
    _count: true,
  });

  const byDoctor = new Map<string, { cashCount: number; onlineCount: number; cashFeeOwed: number; onlinePayoutOwed: number }>();
  for (const g of grouped) {
    const entry = byDoctor.get(g.doctorId) ?? { cashCount: 0, onlineCount: 0, cashFeeOwed: 0, onlinePayoutOwed: 0 };
    if (g.paymentMethod === "CASH") {
      entry.cashCount = g._count;
      entry.cashFeeOwed = g._sum.platformFee ?? 0;
    } else if (g.paymentMethod === "ONLINE") {
      entry.onlineCount = g._count;
      entry.onlinePayoutOwed = (g._sum.amount ?? 0) - (g._sum.platformFee ?? 0);
    }
    byDoctor.set(g.doctorId, entry);
  }

  const doctorIds = [...byDoctor.keys()];
  const doctors = await prisma.user.findMany({
    where: { id: { in: doctorIds } },
    select: { id: true, name: true, mobile: true, doctorProfile: { select: { bankDetails: true } } },
  });
  const infoById = new Map(doctors.map((d) => [d.id, d]));

  const queue = doctorIds.map((doctorId) => {
    const t = byDoctor.get(doctorId)!;
    const info = infoById.get(doctorId);
    return {
      doctorId,
      doctorName: info?.name ?? "Unknown",
      doctorMobile: info?.mobile ?? null,
      bankDetails: info?.doctorProfile?.bankDetails ?? null,
      cashCount: t.cashCount,
      onlineCount: t.onlineCount,
      cashFeeOwed: t.cashFeeOwed,
      onlinePayoutOwed: t.onlinePayoutOwed,
      netAmount: t.onlinePayoutOwed - t.cashFeeOwed,
    };
  });

  queue.sort((a, b) => b.netAmount - a.netAmount);
  return NextResponse.json(queue);
}

// POST: settle every currently-pending appointment for one doctor into a single Settlement record
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const authUser = await getAuthUser();
  const { doctorId, acknowledgeNegative } = await req.json();
  if (!doctorId || typeof doctorId !== "string") {
    return NextResponse.json({ error: "doctorId is required" }, { status: 400 });
  }

  const pending = await prisma.appointment.findMany({
    where: { ...PENDING_WHERE, doctorId },
    select: { id: true },
  });
  if (pending.length === 0) {
    return NextResponse.json({ error: "No pending appointments for this doctor" }, { status: 400 });
  }

  const totals = await pendingTotalsForDoctor(doctorId);

  if (totals.netAmount < 0 && acknowledgeNegative !== true) {
    return NextResponse.json(
      { requiresAcknowledgement: true, ...totals },
      { status: 409 }
    );
  }

  const settlement = await prisma.$transaction(async (tx) => {
    const created = await tx.settlement.create({
      data: {
        doctorId,
        cashCount: totals.cashCount,
        onlineCount: totals.onlineCount,
        cashFeeOwed: totals.cashFeeOwed,
        onlinePayoutOwed: totals.onlinePayoutOwed,
        netAmount: totals.netAmount,
        settledByAdminId: authUser?.id,
      },
    });
    await tx.appointment.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { settlementId: created.id },
    });
    return created;
  });

  return NextResponse.json(settlement);
}
