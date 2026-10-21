import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, parseDateRange, safeNum } from "@/lib/adminAuth";
import { paidInRange, effectivePaidAt } from "@/lib/paidAt";
import { istDayKey } from "@/lib/istDate";

// GET: platform-wide revenue — consultations (doctor and nurse visits) plus
// doctor and nurse registration/subscription fees — as a total summary and a
// day-by-day breakdown (days are IST calendar days).
//
// Coupons: the platform absorbs a coupon's discount. The patient pays
// `amount - discountAmount`, but the provider's payout and `platformFee` are
// still worked out on the full `amount` — so what the platform actually
// earns on a visit is `platformFee - discountAmount`. `platformCommission`
// below is that net figure; `commissionBeforeCoupons` is the raw fee, which
// is what the provider owes (doctorNetPayout = gross - commissionBeforeCoupons).
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const parsedRange = parseDateRange(searchParams);
  if (parsedRange.response) return parsedRange.response;
  const range = parsedRange.range;
  const dateFilter = range.gte || range.lte ? range : undefined;

  const [appointments, doctorLogs, nurseLogs] = await Promise.all([
    prisma.appointment.findMany({
      // Rows without paidAt (older ones) are dated by their visit instead of
      // silently dropping out of every date range.
      where: { status: "COMPLETED", paymentStatus: "PAID", ...(dateFilter ? paidInRange(dateFilter) : {}) },
      select: { amount: true, platformFee: true, discountAmount: true, paidAt: true, scheduledAt: true },
    }),
    prisma.doctorPaymentLog.findMany({
      where: dateFilter ? { createdAt: dateFilter } : undefined,
      select: { type: true, amount: true, createdAt: true },
    }),
    prisma.nursePaymentLog.findMany({
      where: dateFilter ? { createdAt: dateFilter } : undefined,
      select: { type: true, amount: true, createdAt: true },
    }),
  ]);

  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + safeNum(r.amount), 0);
  const grossConsultRevenue = appointments.reduce((s, a) => s + safeNum(a.amount), 0);
  const commissionBeforeCoupons = appointments.reduce((s, a) => s + safeNum(a.platformFee), 0);
  const couponDiscounts = appointments.reduce((s, a) => s + safeNum(a.discountAmount), 0);
  const platformCommission = commissionBeforeCoupons - couponDiscounts;
  const doctorNetPayout = grossConsultRevenue - commissionBeforeCoupons;
  const registrationRevenue = sum(doctorLogs.filter((l) => l.type === "REGISTRATION"));
  const subscriptionRevenue = sum(doctorLogs.filter((l) => l.type === "SUBSCRIPTION"));
  const nurseRegistrationRevenue = sum(nurseLogs.filter((l) => l.type === "REGISTRATION"));
  const nurseSubscriptionRevenue = sum(nurseLogs.filter((l) => l.type === "SUBSCRIPTION"));

  type Day = { date: string; consultRevenue: number; couponDiscounts: number; platformCommission: number; registrationRevenue: number; subscriptionRevenue: number; nurseRevenue: number };
  const byDay = new Map<string, Day>();
  const entry = (day: string) => {
    let e = byDay.get(day);
    if (!e) {
      e = { date: day, consultRevenue: 0, couponDiscounts: 0, platformCommission: 0, registrationRevenue: 0, subscriptionRevenue: 0, nurseRevenue: 0 };
      byDay.set(day, e);
    }
    return e;
  };
  for (const a of appointments) {
    const e = entry(istDayKey(effectivePaidAt(a)));
    e.consultRevenue += safeNum(a.amount);
    e.couponDiscounts += safeNum(a.discountAmount);
    e.platformCommission += safeNum(a.platformFee) - safeNum(a.discountAmount);
  }
  for (const l of doctorLogs) {
    const e = entry(istDayKey(l.createdAt));
    if (l.type === "REGISTRATION") e.registrationRevenue += safeNum(l.amount);
    else e.subscriptionRevenue += safeNum(l.amount);
  }
  for (const l of nurseLogs) entry(istDayKey(l.createdAt)).nurseRevenue += safeNum(l.amount);

  const rows = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({
    summary: {
      grossConsultRevenue,
      commissionBeforeCoupons,
      couponDiscounts,
      platformCommission,
      doctorNetPayout,
      registrationRevenue,
      subscriptionRevenue,
      nurseRegistrationRevenue,
      nurseSubscriptionRevenue,
      totalPlatformEarnings:
        platformCommission + registrationRevenue + subscriptionRevenue + nurseRegistrationRevenue + nurseSubscriptionRevenue,
    },
    rows,
  });
}
