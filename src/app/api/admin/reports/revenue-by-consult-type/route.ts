import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { money, sumMoney } from "@/lib/money";
import { requireAdmin, parseDateRange, safeNum, finiteMoney, nonFiniteMoney } from "@/lib/adminAuth";
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

  // Summed in SQL; the rare legacy row with a NaN/Infinity amount is added
  // by itself (that column as 0) instead of turning its consult type's whole
  // SUM() into NaN.
  const where = { status: "COMPLETED", paymentStatus: "PAID", ...(dateFilter ? paidInRange(dateFilter) : {}) };
  const SUMMED = ["amount", "platformFee", "discountAmount"] as const;
  const [clean, odd] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["consultType"],
      where: { AND: [where, finiteMoney(SUMMED)] },
      _count: { _all: true },
      _sum: { amount: true, platformFee: true, discountAmount: true },
    }),
    prisma.appointment.findMany({
      where: { AND: [where, nonFiniteMoney(SUMMED)] },
      select: { consultType: true, amount: true, platformFee: true, discountAmount: true },
    }),
  ]);

  // The platform absorbs coupon discounts (see revenue-summary): its commission
  // on a visit is `platformFee - discountAmount`; the provider is still owed
  // `amount - platformFee`.
  const byType = new Map(clean.map((g) => [g.consultType, {
    bookingCount: g._count._all,
    grossRevenue: g._sum.amount ?? 0,
    commissionBeforeCoupons: g._sum.platformFee ?? 0,
    couponDiscounts: g._sum.discountAmount ?? 0,
  }]));
  for (const a of odd) {
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
