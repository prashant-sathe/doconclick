import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, parseDateRange, safeNum } from "@/lib/adminAuth";

// GET: Online vs Cash collection breakdown, plus the list of still-unpaid bookings.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const range = parseDateRange(searchParams);
  const dateFilter = range.gte || range.lte ? range : undefined;
  const where = dateFilter ? { createdAt: dateFilter } : {};

  // Summed in JS rather than via Prisma's groupBy/_sum: a single row with a
  // corrupt (NaN) amount would otherwise poison the whole SQL-level SUM() for
  // its (method, status) group, zeroing out every other appointment in it.
  const [allForBreakdown, unpaid] = await Promise.all([
    prisma.appointment.findMany({
      where,
      select: { paymentMethod: true, paymentStatus: true, amount: true },
    }),
    prisma.appointment.findMany({
      where: { ...where, paymentStatus: "PENDING", amount: { gt: 0 }, status: { notIn: ["REJECTED", "CANCELLED", "EXPIRED"] } },
      select: {
        id: true, amount: true, paymentMethod: true, status: true, scheduledAt: true,
        patient: { select: { name: true, mobile: true } },
        doctor: { select: { name: true } },
      },
      orderBy: { scheduledAt: "desc" },
    }),
  ]);

  const byGroup = new Map<string, { paymentMethod: string; paymentStatus: string; count: number; total: number }>();
  for (const a of allForBreakdown) {
    const key = `${a.paymentMethod}::${a.paymentStatus}`;
    const e = byGroup.get(key) ?? { paymentMethod: a.paymentMethod, paymentStatus: a.paymentStatus, count: 0, total: 0 };
    e.count += 1;
    e.total += safeNum(a.amount);
    byGroup.set(key, e);
  }
  const breakdown = [...byGroup.values()];

  const rows = unpaid.map((a) => ({
    appointmentId: a.id,
    patientName: a.patient.name,
    patientMobile: a.patient.mobile,
    doctorName: a.doctor.name,
    amount: safeNum(a.amount),
    paymentMethod: a.paymentMethod,
    status: a.status,
    scheduledAt: a.scheduledAt,
  }));

  return NextResponse.json({
    summary: {
      onlineCollected: breakdown.filter((b) => b.paymentMethod === "ONLINE" && b.paymentStatus === "PAID").reduce((s, b) => s + b.total, 0),
      cashCollected: breakdown.filter((b) => b.paymentMethod === "CASH" && b.paymentStatus === "PAID").reduce((s, b) => s + b.total, 0),
      unpaidAmount: rows.reduce((s, r) => s + r.amount, 0),
      unpaidCount: rows.length,
    },
    breakdown,
    rows,
  });
}
