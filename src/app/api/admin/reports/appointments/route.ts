import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, parseDateRange, safeNum } from "@/lib/adminAuth";

// GET: full bookings register with filters — for export/audit.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const range = parseDateRange(searchParams);
  const status = searchParams.get("status");
  const consultType = searchParams.get("consultType");

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(range.gte || range.lte ? { scheduledAt: range } : {}),
      ...(status && status !== "ALL" ? { status } : {}),
      ...(consultType && consultType !== "ALL" ? { consultType } : {}),
    },
    orderBy: { scheduledAt: "desc" },
    select: {
      id: true, status: true, consultType: true, paymentMethod: true, paymentStatus: true,
      amount: true, platformFee: true, scheduledAt: true, createdAt: true, paidAt: true,
      patient: { select: { name: true, mobile: true } },
      doctor: { select: { name: true } },
    },
  });

  const rows = appointments.map((a) => ({
    appointmentId: a.id,
    patientName: a.patient.name,
    patientMobile: a.patient.mobile,
    doctorName: a.doctor.name,
    consultType: a.consultType,
    status: a.status,
    paymentMethod: a.paymentMethod,
    paymentStatus: a.paymentStatus,
    amount: safeNum(a.amount),
    platformFee: safeNum(a.platformFee),
    scheduledAt: a.scheduledAt,
    createdAt: a.createdAt,
    paidAt: a.paidAt,
  }));

  return NextResponse.json({
    summary: { totalBookings: rows.length, totalAmount: rows.reduce((s, r) => s + r.amount, 0) },
    rows,
  });
}
