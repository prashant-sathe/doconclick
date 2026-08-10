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

// PATCH – update doctor status and/or verification
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status, isVerified } = await req.json();

  const data: { status?: string; isVerified?: boolean } = {};

  if (status !== undefined) {
    const valid = ["APPROVED", "REJECTED", "SUSPENDED", "PENDING"];
    if (!valid.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = status;
  }

  if (isVerified !== undefined) {
    if (isVerified) {
      const profile = await prisma.doctorProfile.findUnique({
        where: { userId: id },
        select: { registrationFeePaid: true },
      });
      if (!profile?.registrationFeePaid) {
        return NextResponse.json(
          { error: "Cannot verify: doctor hasn't paid the ₹99 registration fee yet." },
          { status: 400 }
        );
      }
    }
    data.isVerified = Boolean(isVerified);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.doctorProfile.update({
    where: { userId: id },
    data,
  });

  return NextResponse.json(updated);
}

