import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { money, sumMoney } from "@/lib/money";
import { requireAdmin, parseDateRange, safeNum } from "@/lib/adminAuth";
import { paidInRange } from "@/lib/paidAt";

// GET: revenue split by CLINIC / HOME / VIDEO consult type.
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
  // its group, zeroing out every other appointment in that consult type.
  const appointments = await prisma.appointment.findMany({
    // Rows without paidAt (older ones) are dated by their visit instead of
    // silently dropping out of every date range.
    where: { status: "COMPLETED", paymentStatus: "PAID", ...(dateFilter ? paidInRange(dateFilter) : {}) },
    select: { consultType: true, amount: true, platformFee: true, discountAmount: true },
  });

  // The platform absorbs coupon discounts (see revenue-summary): its commission
  // on a visit is `platformFee - discountAmount`; the provider is still owed
  // `amount - platformFee`.
  const byType = new Map<string, { bookingCount: number; grossRevenue: number; commissionBeforeCoupons: number; couponDiscounts: number }>();
  for (const a of appointments) {
    const e = byType.get(a.consultType) ?? { bookingCount: 0, grossRevenue: 0, commissionBeforeCoupons: 0, couponDiscounts: 0 };
    e.bookingCount += 1;
    e.grossRevenue += safeNum(a.amount);
    e.commissionBeforeCoupons += safeNum(a.platformFee);
    e.couponDiscounts += safeNum(a.discountAmount);
    byType.set(a.consultType, e);
  }

  const rows = [...byType.entries()]
    .map(([consultType, e]) => {
      // Rounded to paise; derived columns from the rounded parts (src/lib/money.ts).
      const grossRevenue = money(e.grossRevenue), commissionBeforeCoupons = money(e.commissionBeforeCoupons), couponDiscounts = money(e.couponDiscounts);
      return {
        consultType,
        bookingCount: e.bookingCount,
        grossRevenue,
        commissionBeforeCoupons,
        couponDiscounts,
        platformCommission: sumMoney([commissionBeforeCoupons, -couponDiscounts]),
        doctorNetPayout: sumMoney([grossRevenue, -commissionBeforeCoupons]),
      };
    })
    .sort((a, b) => b.grossRevenue - a.grossRevenue);

  return NextResponse.json({
    summary: {
      totalBookings: rows.reduce((s, r) => s + r.bookingCount, 0),
      totalRevenue: sumMoney(rows.map((r) => r.grossRevenue)),
    },
    rows,
  });
}
