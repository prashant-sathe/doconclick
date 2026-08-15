import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: past settlements across all doctors, newest first
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const settlements = await prisma.settlement.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      doctor: { select: { name: true } },
      settledByAdmin: { select: { name: true } },
    },
  });

  return NextResponse.json(settlements);
}
