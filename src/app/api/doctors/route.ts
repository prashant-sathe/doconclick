import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: List approved doctors for patient portal, optionally filtered by specialty
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const specialty = searchParams.get("specialty");

  const now = new Date();
  const doctors = await prisma.user.findMany({
    where: {
      role: "DOCTOR",
      doctorProfile: {
        status: "APPROVED",
        isVerified: true,
        ...(specialty ? { specialty } : {}),
        // Only show doctors with an active free trial or paid monthly plan —
        // otherwise patients could book someone whose dashboard is locked.
        OR: [{ trialEndsAt: { gt: now } }, { subscriptionPaidUntil: { gt: now } }],
      },
    },
    include: { doctorProfile: true },
  });
  return NextResponse.json(doctors);
}
