import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, safeNum } from "@/lib/adminAuth";

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const appointments = await prisma.appointment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { name: true } },
      doctor: { select: { name: true } },
    },
  });
  return NextResponse.json(
    appointments.map((a) => ({
      ...a,
      amount: safeNum(a.amount),
      platformFee: safeNum(a.platformFee),
    }))
  );
}
