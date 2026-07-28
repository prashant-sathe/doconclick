import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET – full doctor profile for admin view
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      doctorProfile: true,
      asDoctor: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { patient: { select: { name: true, mobile: true } } },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalEarnings = user.asDoctor
    .filter((a) => a.status === "COMPLETED")
    .reduce((sum, a) => sum + (a.amount ?? 0), 0);

  const completedCount  = user.asDoctor.filter((a) => a.status === "COMPLETED").length;
  const scheduledCount  = user.asDoctor.filter((a) => a.status === "SCHEDULED").length;
  const cancelledCount  = user.asDoctor.filter((a) => a.status === "CANCELLED").length;

  return NextResponse.json({
    ...user,
    password: undefined,
    stats: { totalEarnings, completedCount, scheduledCount, cancelledCount },
  });
}

// PATCH – update doctor status
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status } = await req.json();

  const valid = ["APPROVED", "REJECTED", "SUSPENDED", "PENDING"];
  if (!valid.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.doctorProfile.update({
    where: { userId: id },
    data: { status },
  });

  return NextResponse.json(updated);
}

