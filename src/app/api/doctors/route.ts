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
      deletedAt: null,
      doctorProfile: {
        status: "APPROVED",
        isVerified: true,
        ...(specialty ? { specialty } : {}),
        // Only show doctors with an active free trial or paid monthly plan —
        // otherwise patients could book someone whose dashboard is locked.
        OR: [{ trialEndsAt: { gt: now } }, { subscriptionPaidUntil: { gt: now } }],
      },
    },
    select: {
      id: true,
      name: true,
      // Public endpoint — never expose bank details, KYC/certificate files or
      // payment ids (the doctor's own /api/doctors/me has those).
      doctorProfile: {
        omit: {
          bankDetails: true,
          kycDocUrl: true,
          medRegCertUrl: true,
          degreeCertUrl: true,
          signatureUrl: true,
          cashfreeOrderId: true,
          cashfreePaymentId: true,
        },
      },
      clinics: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { slots: true } },
    },
  });
  return NextResponse.json(doctors);
}
