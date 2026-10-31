import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { money, sumMoney } from "@/lib/money";
import { requireAdmin, parseDateRange, finiteMoney, nonFiniteMoney } from "@/lib/adminAuth";

// GET: Online vs Cash collection breakdown, plus the list of still-unpaid bookings.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const parsedRange = parseDateRange(searchParams);
  if (parsedRange.response) return parsedRange.response;
  const range = parsedRange.range;
  const dateFilter = range.gte || range.lte ? range : undefined;
  const where = dateFilter ? { createdAt: dateFilter } : {};

  // Summed in SQL; the rare legacy row with a NaN/Infinity amount is counted
  // with ₹0 instead of turning its group's whole SUM() into NaN.
  const [clean, odd, unpaid] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["paymentMethod", "paymentStatus"],
      where: { ...where, ...finiteMoney(["amount"]) },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.appointment.findMany({ where: { ...where, ...nonFiniteMoney(["amount"]) }, select: { paymentMethod: true, paymentStatus: true } }),
    prisma.appointment.findMany({
      where: { ...where, paymentStatus: "PENDING", amount: { gt: 0 }, status: { notIn: ["REJECTED", "CANCELLED", "EXPIRED", "NO_SHOW"] } },
      select: {
        id: true, amount: true, paymentMethod: true, status: true, scheduledAt: true,
        patient: { select: { name: true, mobile: true } },
        doctor: { select: { name: true } },
      },
      orderBy: { scheduledAt: "desc" },
    }),
  ]);

  const byGroup = new Map<string, { paymentMethod: string; paymentStatus: string; count: number; total: number }>(
    clean.map((g) => [`${g.paymentMethod}::${g.paymentStatus}`, { paymentMethod: g.paymentMethod, paymentStatus: g.paymentStatus, count: g._count._all, total: g._sum.amount ?? 0 }]),
  );
  for (const a of odd) {
    const key = `${a.paymentMethod}::${a.paymentStatus}`;
    const e = byGroup.get(key) ?? { paymentMethod: a.paymentMethod, paymentStatus: a.paymentStatus, count: 0, total: 0 };
    e.count += 1;
    byGroup.set(key, e);
  }
  const breakdown = [...byGroup.values()].map((b) => ({ ...b, total: money(b.total) }));

  const rows = unpaid.map((a) => ({
    appointmentId: a.id,
    patientName: a.patient.name,
    patientMobile: a.patient.mobile,
    doctorName: a.doctor.name,
    amount: money(a.amount),
    paymentMethod: a.paymentMethod,
    status: a.status,
    scheduledAt: a.scheduledAt,
  }));

  return NextResponse.json({
    summary: {
      onlineCollected: sumMoney(breakdown.filter((b) => b.paymentMethod === "ONLINE" && b.paymentStatus === "PAID").map((b) => b.total)),
      cashCollected: sumMoney(breakdown.filter((b) => b.paymentMethod === "CASH" && b.paymentStatus === "PAID").map((b) => b.total)),
      unpaidAmount: sumMoney(rows.map((r) => r.amount)),
      unpaidCount: rows.length,
    },
    breakdown,
    rows,
  });
}
