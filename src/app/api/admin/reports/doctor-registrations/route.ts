import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { DOCTOR_REGISTRATION_FEE } from "@/lib/cashfree";

// GET: every doctor's ₹99 registration-fee payment status, with the date it was paid.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const profiles = await prisma.doctorProfile.findMany({
    orderBy: { user: { createdAt: "desc" } },
    select: {
      registrationFeePaid: true,
      registrationFeeStatus: true,
      cashfreePaymentId: true,
      user: {
        select: {
          id: true,
          name: true,
          mobile: true,
          email: true,
          createdAt: true,
          paymentLogs: {
            where: { type: "REGISTRATION" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { amount: true, createdAt: true, cashfreePaymentId: true },
          },
        },
      },
    },
  });

  const rows = profiles.map((p) => {
    const log = p.user.paymentLogs[0] ?? null;
    return {
      doctorId: p.user.id,
      doctorName: p.user.name,
      doctorMobile: p.user.mobile,
      doctorEmail: p.user.email,
      registeredOn: p.user.createdAt,
      feeStatus: p.registrationFeeStatus,
      amount: log?.amount ?? (p.registrationFeePaid ? DOCTOR_REGISTRATION_FEE : null),
      paidAt: log?.createdAt ?? null,
      cashfreePaymentId: log?.cashfreePaymentId ?? p.cashfreePaymentId,
    };
  });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const filtered = status && status !== "ALL" ? rows.filter((r) => r.feeStatus === status) : rows;

  return NextResponse.json({
    summary: {
      totalDoctors: rows.length,
      paidCount: rows.filter((r) => r.feeStatus === "PAID").length,
      pendingCount: rows.filter((r) => r.feeStatus !== "PAID").length,
      totalCollected: rows.reduce((sum, r) => sum + (r.feeStatus === "PAID" ? DOCTOR_REGISTRATION_FEE : 0), 0),
    },
    rows: filtered,
  });
}
