import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { money, sumMoney } from "@/lib/money";
import { requireAdmin, parseDateRange, safeNum } from "@/lib/adminAuth";
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

  // Summed in JS rather than via Prisma's groupBy/_sum: a single row with a
  // corrupt (NaN) amount would otherwise poison the whole SQL-level SUM() for
  // that doctor, zeroing out every other completed appointment they have.
  const appointments = await prisma.appointment.findMany({
    // Rows without paidAt (older ones) are dated by their visit instead of
    // silently dropping out of every date range.
    where: { status: "COMPLETED", paymentStatus: "PAID", ...(dateFilter ? paidInRange(dateFilter) : {}) },
    select: { doctorId: true, amount: true, platformFee: true },
  });
  const byDoctor = new Map<string, { count: number; amount: number; platformFee: number }>();
  for (const a of appointments) {
    const e = byDoctor.get(a.doctorId) ?? { count: 0, amount: 0, platformFee: 0 };
    e.count += 1;
    e.amount += safeNum(a.amount);
    e.platformFee += safeNum(a.platformFee);
    byDoctor.set(a.doctorId, e);
  }
  const grouped = [...byDoctor.entries()].map(([doctorId, e]) => ({
    doctorId,
    _sum: { amount: e.amount, platformFee: e.platformFee },
    _count: e.count,
  }));

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
      const grossEarnings = money(g._sum.amount);
      const platformFeePaid = money(g._sum.platformFee);
      return {
        doctorId: g.doctorId,
        doctorName: d?.name ?? "Unknown",
        doctorMobile: d?.mobile ?? null,
        specialty: d?.doctorProfile?.specialty ?? null,
        status: d?.doctorProfile?.status ?? null,
        avgRating: d?.doctorProfile?.avgRating ?? 0,
        totalReviews: d?.doctorProfile?.totalReviews ?? 0,
        completedBookings: g._count,
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
