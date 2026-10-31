import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { money, sumMoney } from "@/lib/money";
import { requireAdmin, parseDateRange, safeNum, finiteMoney, nonFiniteMoney } from "@/lib/adminAuth";
import { paidInRange } from "@/lib/paidAt";

// GET: per-doctor activity + earnings summary.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const parsedRange = parseDateRange(searchParams);
  if (parsedRange.response) return parsedRange.response;
  const range = parsedRange.range;
  const dateFilter = range.gte || range.lte ? range : undefined;

  // Summed in SQL; the rare legacy row with a NaN/Infinity amount is added
  // by itself as 0 instead of turning its doctor's whole SUM() into NaN.
  const where = { status: "COMPLETED", paymentStatus: "PAID", ...(dateFilter ? paidInRange(dateFilter) : {}) };
  const SUMMED = ["amount", "platformFee"] as const;
  const [clean, odd] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["doctorId"],
      where: { AND: [where, finiteMoney(SUMMED)] },
      _count: { _all: true },
      _sum: { amount: true, platformFee: true },
    }),
    prisma.appointment.findMany({ where: { AND: [where, nonFiniteMoney(SUMMED)] }, select: { doctorId: true, amount: true, platformFee: true } }),
  ]);
  const byDoctor = new Map(clean.map((g) => [g.doctorId, { count: g._count._all, amount: g._sum.amount ?? 0, platformFee: g._sum.platformFee ?? 0 }]));
  for (const a of odd) {
    const e = byDoctor.get(a.doctorId) ?? { count: 0, amount: 0, platformFee: 0 };
    e.count += 1;
    e.amount += safeNum(a.amount);
    e.platformFee += safeNum(a.platformFee);
    byDoctor.set(a.doctorId, e);
  }
  const grouped = [...byDoctor.entries()].map(([doctorId, e]) => ({ doctorId, ...e }));

  const doctorIds = grouped.map((g) => g.doctorId);
  const doctors = await prisma.user.findMany({
    where: { id: { in: doctorIds } },
    select: {
      id: true, name: true, mobile: true,
      doctorProfile: { select: { specialty: true, avgRating: true, totalReviews: true, status: true } },
    },
  });
  const byId = new Map(doctors.map((d) => [d.id, d]));

  const rows = grouped
    .map((g) => {
      const d = byId.get(g.doctorId);
      // Rounded to paise; net from the rounded parts (src/lib/money.ts).
      const grossEarnings = money(g.amount);
      const platformFeePaid = money(g.platformFee);
      return {
        doctorId: g.doctorId,
        doctorName: d?.name ?? "Unknown",
        doctorMobile: d?.mobile ?? null,
        specialty: d?.doctorProfile?.specialty ?? null,
        status: d?.doctorProfile?.status ?? null,
        avgRating: d?.doctorProfile?.avgRating ?? 0,
        totalReviews: d?.doctorProfile?.totalReviews ?? 0,
        completedBookings: g.count,
        grossEarnings,
        platformFeePaid,
        netEarnings: sumMoney([grossEarnings, -platformFeePaid]),
      };
    })
    .sort((a, b) => b.grossEarnings - a.grossEarnings);

  return NextResponse.json({
    summary: {
      activeDoctors: rows.length,
      totalGrossEarnings: sumMoney(rows.map((r) => r.grossEarnings)),
      totalNetToDoctor: sumMoney(rows.map((r) => r.netEarnings)),
    },
    rows,
  });
}
