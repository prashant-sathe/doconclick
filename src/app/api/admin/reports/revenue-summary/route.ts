import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, parseDateRange, safeNum } from "@/lib/adminAuth";

// GET: platform-wide revenue — consultations + doctor registration/subscription fees —
// as a total summary plus a day-by-day breakdown.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const range = parseDateRange(searchParams);
  const dateFilter = range.gte || range.lte ? range : undefined;

  const [appointments, paymentLogs] = await Promise.all([
    prisma.appointment.findMany({
      where: { status: "COMPLETED", paymentStatus: "PAID", ...(dateFilter ? { paidAt: dateFilter } : {}) },
      select: { amount: true, platformFee: true, paidAt: true },
    }),
    prisma.doctorPaymentLog.findMany({
      where: dateFilter ? { createdAt: dateFilter } : undefined,
      select: { type: true, amount: true, createdAt: true },
    }),
  ]);

  const grossConsultRevenue = appointments.reduce((s, a) => s + safeNum(a.amount), 0);
  const platformCommission = appointments.reduce((s, a) => s + safeNum(a.platformFee), 0);
  const doctorNetPayout = grossConsultRevenue - platformCommission;
  const registrationRevenue = paymentLogs.filter((l) => l.type === "REGISTRATION").reduce((s, l) => s + safeNum(l.amount), 0);
  const subscriptionRevenue = paymentLogs.filter((l) => l.type === "SUBSCRIPTION").reduce((s, l) => s + safeNum(l.amount), 0);

  const byDay = new Map<string, { date: string; consultRevenue: number; platformCommission: number; registrationRevenue: number; subscriptionRevenue: number }>();
  const dayKey = (d: Date) => new Date(d).toISOString().slice(0, 10);
  const entry = (day: string) => {
    let e = byDay.get(day);
    if (!e) {
      e = { date: day, consultRevenue: 0, platformCommission: 0, registrationRevenue: 0, subscriptionRevenue: 0 };
      byDay.set(day, e);
    }
    return e;
  };
  for (const a of appointments) {
    if (!a.paidAt) continue;
    const e = entry(dayKey(a.paidAt));
    e.consultRevenue += safeNum(a.amount);
    e.platformCommission += safeNum(a.platformFee);
  }
  for (const l of paymentLogs) {
    const e = entry(dayKey(l.createdAt));
    if (l.type === "REGISTRATION") e.registrationRevenue += safeNum(l.amount);
    else e.subscriptionRevenue += safeNum(l.amount);
  }

  const rows = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({
    summary: {
      grossConsultRevenue,
      platformCommission,
      doctorNetPayout,
      registrationRevenue,
      subscriptionRevenue,
      totalPlatformEarnings: platformCommission + registrationRevenue + subscriptionRevenue,
    },
    rows,
  });
}
