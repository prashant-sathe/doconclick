import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, parseDateRange, safeNum } from "@/lib/adminAuth";

// GET: revenue split by CLINIC / HOME / VIDEO consult type.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const range = parseDateRange(searchParams);
  const dateFilter = range.gte || range.lte ? range : undefined;

  // Summed in JS rather than via Prisma's groupBy/_sum: a single row with a
  // corrupt (NaN) amount would otherwise poison the whole SQL-level SUM() for
  // its group, zeroing out every other appointment in that consult type.
  const appointments = await prisma.appointment.findMany({
    where: { status: "COMPLETED", paymentStatus: "PAID", ...(dateFilter ? { paidAt: dateFilter } : {}) },
    select: { consultType: true, amount: true, platformFee: true },
  });

  const byType = new Map<string, { bookingCount: number; grossRevenue: number; platformCommission: number }>();
  for (const a of appointments) {
    const e = byType.get(a.consultType) ?? { bookingCount: 0, grossRevenue: 0, platformCommission: 0 };
    e.bookingCount += 1;
    e.grossRevenue += safeNum(a.amount);
    e.platformCommission += safeNum(a.platformFee);
    byType.set(a.consultType, e);
  }

  const rows = [...byType.entries()]
    .map(([consultType, e]) => ({
      consultType,
      bookingCount: e.bookingCount,
      grossRevenue: e.grossRevenue,
      platformCommission: e.platformCommission,
      doctorNetPayout: e.grossRevenue - e.platformCommission,
    }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue);

  return NextResponse.json({
    summary: {
      totalBookings: rows.reduce((s, r) => s + r.bookingCount, 0),
      totalRevenue: rows.reduce((s, r) => s + r.grossRevenue, 0),
    },
    rows,
  });
}
