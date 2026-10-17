import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { safeNum } from "@/lib/adminAuth";
import { Prisma } from "@/generated/prisma/client";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

const PENDING_WHERE = { status: "COMPLETED", paymentStatus: "PAID", settlementId: null } as const;

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
      entry.cashFeeOwed = safeNum(g._sum.platformFee);
    } else if (g.paymentMethod === "ONLINE") {
      entry.onlineCount = g._count;
      entry.onlinePayoutOwed = safeNum(g._sum.amount) - safeNum(g._sum.platformFee);
    }
    byDoctor.set(g.doctorId, entry);
  }

  const doctorIds = [...byDoctor.keys()];
  const doctors = await prisma.user.findMany({
    where: { id: { in: doctorIds } },
    select: { id: true, name: true, mobile: true, role: true, doctorProfile: { select: { bankDetails: true } }, nurseProfile: { select: { bankDetails: true } } },
  });
  const infoById = new Map(doctors.map((d) => [d.id, d]));

  const openRequests = await prisma.payoutRequest.findMany({
    where: { doctorId: { in: doctorIds }, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  const requestByDoctor = new Map(openRequests.map((r) => [r.doctorId, r]));

  const queue = doctorIds.map((doctorId) => {
    const t = byDoctor.get(doctorId)!;
    const info = infoById.get(doctorId);
    const request = requestByDoctor.get(doctorId);
    return {
      doctorId,
      doctorName: info?.name ?? "Unknown",
      doctorMobile: info?.mobile ?? null,
      providerRole: info?.role ?? "DOCTOR",
      bankDetails: info?.doctorProfile?.bankDetails ?? info?.nurseProfile?.bankDetails ?? null,
      cashCount: t.cashCount,
      onlineCount: t.onlineCount,
      cashFeeOwed: t.cashFeeOwed,
      onlinePayoutOwed: t.onlinePayoutOwed,
      netAmount: t.onlinePayoutOwed - t.cashFeeOwed,
      payoutRequestedAt: request?.createdAt ?? null,
    };
  });

  // Doctors who've actively asked to be paid float to the top, ahead of the
  // usual highest-amount-first sort.
  queue.sort((a, b) => {
    if (!!a.payoutRequestedAt !== !!b.payoutRequestedAt) return a.payoutRequestedAt ? -1 : 1;
    return b.netAmount - a.netAmount;
  });
  return NextResponse.json(queue);
}

class NothingToSettleError extends Error {}
class NeedsAcknowledgementError extends Error {
  constructor(public totals: Awaited<ReturnType<typeof totalsForSettlement>>) { super("negative net"); }
}

// A doctor's dues, computed over exactly the rows a settlement claimed: online
// payouts owed to them minus the platform's fee on cash they collected.
async function totalsForSettlement(tx: Prisma.TransactionClient, settlementId: string) {
  const grouped = await tx.appointment.groupBy({
    by: ["paymentMethod"],
    where: { settlementId },
    _sum: { amount: true, platformFee: true },
    _count: true,
  });
  let cashCount = 0, onlineCount = 0, cashFeeOwed = 0, onlinePayoutOwed = 0;
  for (const g of grouped) {
    if (g.paymentMethod === "CASH") {
      cashCount = g._count;
      cashFeeOwed = safeNum(g._sum.platformFee);
    } else if (g.paymentMethod === "ONLINE") {
      onlineCount = g._count;
      onlinePayoutOwed = safeNum(g._sum.amount) - safeNum(g._sum.platformFee);
    }
  }
  return { cashCount, onlineCount, cashFeeOwed, onlinePayoutOwed, netAmount: onlinePayoutOwed - cashFeeOwed };
}

// POST: settle every currently-pending appointment for one doctor into a single Settlement record.
// Idempotent: rows are claimed (settlementId null → this settlement) inside
// the transaction and the totals come from exactly the claimed rows, so two
// concurrent settles can never pay out the same appointment twice; a repeated
// idempotencyKey returns the settlement it already created.
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const authUser = await getAuthUser();
  const { doctorId, acknowledgeNegative, idempotencyKey } = await req.json().catch(() => ({}));
  if (!doctorId || typeof doctorId !== "string") {
    return NextResponse.json({ error: "doctorId is required" }, { status: 400 });
  }
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 100)) {
    return NextResponse.json({ error: "Invalid idempotencyKey" }, { status: 400 });
  }

  const replay = async () => {
    const existing = await prisma.settlement.findUnique({ where: { idempotencyKey } });
    if (!existing) return null;
    if (existing.doctorId !== doctorId) {
      return NextResponse.json({ error: "This idempotencyKey was already used for another settlement." }, { status: 409 });
    }
    return NextResponse.json({ ...existing, replayed: true });
  };
  if (idempotencyKey) {
    const replayed = await replay();
    if (replayed) return replayed;
  }

  try {
    const settlement = await prisma.$transaction(async (tx) => {
      // Created first so the claim below has an id to point at; zero totals
      // are filled in from the claimed rows. The unique idempotencyKey makes a
      // concurrent duplicate wait here and then fail (P2002 → replay).
      const created = await tx.settlement.create({
        data: { doctorId, netAmount: 0, settledByAdminId: authUser?.id, idempotencyKey: idempotencyKey ?? null },
      });
      const { count } = await tx.appointment.updateMany({
        where: { ...PENDING_WHERE, doctorId },
        data: { settlementId: created.id },
      });
      if (count === 0) throw new NothingToSettleError();

      const totals = await totalsForSettlement(tx, created.id);
      if (totals.netAmount < 0 && acknowledgeNegative !== true) throw new NeedsAcknowledgementError(totals);

      const settled = await tx.settlement.update({ where: { id: created.id }, data: totals });
      await tx.payoutRequest.updateMany({
        where: { doctorId, status: "PENDING" },
        data: { status: "FULFILLED", resolvedAt: new Date(), settlementId: created.id },
      });
      return settled;
    });
    return NextResponse.json(settlement);
  } catch (err) {
    if (err instanceof NeedsAcknowledgementError) {
      return NextResponse.json({ requiresAcknowledgement: true, ...err.totals }, { status: 409 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && idempotencyKey) {
      const replayed = await replay();
      if (replayed) return replayed;
    }
    if (err instanceof NothingToSettleError) {
      // Usually a double-submit without a key, or another admin got there first.
      return NextResponse.json({ error: "No pending appointments for this doctor — they may have just been settled." }, { status: 400 });
    }
    throw err;
  }
}
