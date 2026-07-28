import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
      prisma.appointment.aggregate({
        _sum: { amount: true, platformFee: true },
        where: { status: "COMPLETED" },
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
      totalRevenue: revenueData._sum.amount ?? 0,
      totalPlatformFee: revenueData._sum.platformFee ?? 0,
      recentAppointments,
      pendingDoctors,
      openComplaints: complaints,
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
