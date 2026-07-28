import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: List approved doctors for patient portal
export async function GET() {
  const doctors = await prisma.user.findMany({
    where: { role: "DOCTOR", doctorProfile: { status: "APPROVED" } },
    include: { doctorProfile: true },
  });
  return NextResponse.json(doctors);
}
