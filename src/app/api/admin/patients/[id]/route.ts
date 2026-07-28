import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      patientProfile: true,
      asPatient: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          doctor: { select: { name: true, mobile: true, doctorProfile: { select: { specialty: true } } } },
        },
      },
      complaints: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalSpent     = user.asPatient.filter((a) => a.status === "COMPLETED").reduce((s, a) => s + (a.amount ?? 0), 0);
  const completedCount = user.asPatient.filter((a) => a.status === "COMPLETED").length;
  const scheduledCount = user.asPatient.filter((a) => a.status === "SCHEDULED").length;
  const cancelledCount = user.asPatient.filter((a) => a.status === "CANCELLED").length;

  return NextResponse.json({
    ...user,
    password: undefined,
    stats: { totalSpent, completedCount, scheduledCount, cancelledCount },
  });
}
