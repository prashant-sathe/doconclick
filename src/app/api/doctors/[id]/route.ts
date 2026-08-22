import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: A single doctor's public profile (unauthenticated — used by QR/profile links)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const now = new Date();

  const doctor = await prisma.user.findFirst({
    where: {
      id,
      role: "DOCTOR",
      deletedAt: null,
      doctorProfile: {
        status: "APPROVED",
        isVerified: true,
        OR: [{ trialEndsAt: { gt: now } }, { subscriptionPaidUntil: { gt: now } }],
      },
    },
    select: {
      id: true,
      name: true,
      doctorProfile: {
        select: {
          photoUrl: true,
          clinicName: true,
          clinicPhotoUrl: true,
          qualification: true,
          medRegNo: true,
          specialty: true,
          experience: true,
          consultFee: true,
          videoFee: true,
          homeVisitFee: true,
          availability: true,
          languages: true,
          bio: true,
          offersHomeVisit: true,
          offersClinic: true,
          offersVideo: true,
          isVerified: true,
          avgRating: true,
          totalReviews: true,
          radius: true,
          lat: true,
          lng: true,
        },
      },
      clinics: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { slots: true },
      },
    },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  return NextResponse.json(doctor);
}
