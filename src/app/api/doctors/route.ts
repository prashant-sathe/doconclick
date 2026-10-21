import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookableDoctorWhere } from "@/lib/doctorBookable";

// GET: List approved doctors for patient portal, optionally filtered by specialty
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const specialty = searchParams.get("specialty");

  const doctors = await prisma.user.findMany({
    // Ignoring case — a name typed or linked as "dentist" still finds "Dentist".
    where: bookableDoctorWhere(specialty ? { specialty: { equals: specialty, mode: "insensitive" } } : {}),
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
