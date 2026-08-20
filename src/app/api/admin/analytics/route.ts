import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeNum } from "@/lib/adminAuth";

export async function GET() {
  try {
    const [
      totalPatients,
      totalDoctors,
      totalAppointments,
      revenueData,
      recentAppointments,
      pendingDoctors,
      complaints,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "PATIENT" } }),
      prisma.user.count({ where: { role: "DOCTOR" } }),
      prisma.appointment.count(),
      // Summed in JS rather than via Prisma's aggregate/_sum: a single row with a
      // corrupt (NaN) amount would otherwise poison the whole SQL-level SUM(),
      // zeroing out revenue from every other completed appointment.
      prisma.appointment.findMany({
        where: { status: "COMPLETED", paymentStatus: "PAID" },
        select: { amount: true, platformFee: true },
      }),
      prisma.appointment.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          patient: { select: { name: true } },
          doctor: { select: { name: true } },
        },
      }),
      prisma.doctorProfile.count({ where: { status: "PENDING" } }),
      prisma.complaint.count({ where: { status: "OPEN" } }),
    ]);

    return NextResponse.json({
      totalPatients,
      totalDoctors,
      totalAppointments,
      totalRevenue: revenueData.reduce((s, a) => s + safeNum(a.amount), 0),
      totalPlatformFee: revenueData.reduce((s, a) => s + safeNum(a.platformFee), 0),
      recentAppointments,
      pendingDoctors,
      openComplaints: complaints,
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
