import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeNum, requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  try {
    const [
      totalPatients,
      totalDoctors,
      totalNurses,
      totalAppointments,
      revenueData,
      recentAppointments,
      pendingDoctors,
      pendingNurses,
      complaints,
    ] = await Promise.all([
      // Deleted accounts are soft-deleted (deletedAt) and kept for history —
      // they're not users any more, so they aren't counted.
      prisma.user.count({ where: { role: "PATIENT", deletedAt: null } }),
      prisma.user.count({ where: { role: "DOCTOR", deletedAt: null } }),
      prisma.user.count({ where: { role: "NURSE", deletedAt: null } }),
      prisma.appointment.count(),
      // Summed in JS rather than via Prisma's aggregate/_sum: a single row with a
      // corrupt (NaN) amount would otherwise poison the whole SQL-level SUM(),
      // zeroing out revenue from every other completed appointment.
      prisma.appointment.findMany({
        where: { status: "COMPLETED", paymentStatus: "PAID" },
        select: { amount: true, platformFee: true, discountAmount: true },
      }),
      prisma.appointment.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          patient: { select: { name: true } },
          doctor: { select: { name: true } },
        },
      }),
      prisma.doctorProfile.count({ where: { status: "PENDING", user: { deletedAt: null } } }),
      prisma.nurseProfile.count({ where: { status: "PENDING", user: { deletedAt: null } } }),
      prisma.complaint.count({ where: { status: "OPEN" } }),
    ]);

    // `totalPlatformFee` is the commission before coupons — what providers are
    // charged, so gross minus it is their payout. The platform absorbs coupon
    // discounts, so what it actually keeps is `totalPlatformEarnings`.
    const totalPlatformFee = revenueData.reduce((s, a) => s + safeNum(a.platformFee), 0);
    const totalCouponDiscounts = revenueData.reduce((s, a) => s + safeNum(a.discountAmount), 0);

    return NextResponse.json({
      totalPatients,
      totalDoctors,
      totalNurses,
      totalAppointments,
      totalRevenue: revenueData.reduce((s, a) => s + safeNum(a.amount), 0),
      totalPlatformFee,
      totalCouponDiscounts,
      totalPlatformEarnings: totalPlatformFee - totalCouponDiscounts,
      recentAppointments,
      pendingDoctors,
      pendingNurses,
      openComplaints: complaints,
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
