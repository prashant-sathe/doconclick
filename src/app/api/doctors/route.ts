import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: List approved doctors for patient portal, optionally filtered by specialty
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const specialty = searchParams.get("specialty");

  const doctors = await prisma.user.findMany({
    where: {
      role: "DOCTOR",
      doctorProfile: {
        status: "APPROVED",
        isVerified: true,
        ...(specialty ? { specialty } : {}),
      },
    },
    include: { doctorProfile: true },
  });
  return NextResponse.json(doctors);
}
