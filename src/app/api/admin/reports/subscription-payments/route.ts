import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, parseDateRange } from "@/lib/adminAuth";

// GET: history of ₹499/month doctor subscription renewals.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const range = parseDateRange(searchParams);

  const logs = await prisma.doctorPaymentLog.findMany({
    where: {
      type: "SUBSCRIPTION",
      ...(range.gte || range.lte ? { createdAt: range } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { doctor: { select: { id: true, name: true, mobile: true } } },
  });

  const rows = logs.map((l) => ({
    doctorId: l.doctor.id,
    doctorName: l.doctor.name,
    doctorMobile: l.doctor.mobile,
    amount: l.amount,
    paidAt: l.createdAt,
    cashfreePaymentId: l.cashfreePaymentId,
  }));

  return NextResponse.json({
    summary: {
      totalPayments: rows.length,
      totalCollected: rows.reduce((sum, r) => sum + r.amount, 0),
    },
    rows,
  });
}
