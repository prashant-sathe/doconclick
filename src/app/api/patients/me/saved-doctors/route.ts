import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { haversine, withinSearchRadius } from "@/lib/geo";
import { isDoctorBookable, DOCTOR_BOOKABLE_SELECT, UNBOOKABLE_MESSAGE } from "@/lib/doctorBookable";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: the current patient's bookmarked doctors, each tagged with distance
// and whether it falls inside the patient's chosen search range.
export const GET = withErrorLocale(async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Distance/range enrichment is best-effort: if the patient profile can't be
  // read (e.g. a dev server still running against a pre-migration Prisma
  // client), the saved list must still load rather than 500.
  const patientProfile = await prisma.patientProfile
    .findUnique({
      where: { userId: authUser.id },
      select: { lat: true, lng: true, searchRadiusKm: true },
    })
    .catch(() => null);
  const radiusKm = patientProfile?.searchRadiusKm ?? null;

  // A location the patient pinned on the map overrides their profile coords.
  const sp = new URL(req.url).searchParams;
  const pinnedLat = Number(sp.get("lat"));
  const pinnedLng = Number(sp.get("lng"));
  const hasPinned = Number.isFinite(pinnedLat) && Number.isFinite(pinnedLng) && sp.has("lat");
  const fromLat = hasPinned ? pinnedLat : patientProfile?.lat ?? null;
  const fromLng = hasPinned ? pinnedLng : patientProfile?.lng ?? null;

  const saved = await prisma.savedDoctor.findMany({
    where: { patientId: authUser.id },
    orderBy: { createdAt: "desc" },
    include: {
      doctor: {
        select: {
          id: true,
          name: true,
          role: true,
          deletedAt: true,
          doctorProfile: {
            select: {
              isVerified: true,
              trialEndsAt: true,
              subscriptionPaidUntil: true,
              specialty: true,
              photoUrl: true,
              clinicName: true,
              qualification: true,
              experience: true,
              consultFee: true,
              avgRating: true,
              totalReviews: true,
              status: true,
              offersVideo: true,
              lat: true,
              lng: true,
            },
          },
          clinics: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            select: { lat: true, lng: true },
            take: 1,
          },
        },
      },
    },
  });

  const entries = saved.map((s) => {
    const profile = s.doctor.doctorProfile;
    const docLat = profile?.lat ?? s.doctor.clinics[0]?.lat ?? null;
    const docLng = profile?.lng ?? s.doctor.clinics[0]?.lng ?? null;
    const distanceKm =
      fromLat != null && fromLng != null && docLat != null && docLng != null
        ? Math.round(haversine(fromLat, fromLng, docLat, docLng) * 10) / 10
        : null;
    const inRange = withinSearchRadius(distanceKm, radiusKm, profile?.offersVideo ?? false);
    return {
      id: s.id,
      createdAt: s.createdAt,
      distanceKm,
      inRange,
      // A saved doctor stays bookmarked even once they stop taking bookings;
      // the client shows them as unavailable instead of offering Book.
      bookable: isDoctorBookable(s.doctor),
      doctor: {
        id: s.doctor.id,
        name: s.doctor.name,
        // Coordinates are only needed server-side for the distance maths above.
        doctorProfile: profile
          ? {
              specialty: profile.specialty,
              photoUrl: profile.photoUrl,
              clinicName: profile.clinicName,
              qualification: profile.qualification,
              experience: profile.experience,
              consultFee: profile.consultFee,
              avgRating: profile.avgRating,
              totalReviews: profile.totalReviews,
              status: profile.status,
              offersVideo: profile.offersVideo,
            }
          : null,
      },
    };
  });

  return NextResponse.json({ searchRadiusKm: radiusKm, saved: entries });
});

// POST: bookmark a doctor for later booking — only one patients can book now
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { doctorId } = await req.json();
  if (!doctorId || typeof doctorId !== "string") {
    return NextResponse.json({ error: "doctorId is required" }, { status: 400 });
  }

  const doctor = await prisma.user.findUnique({ where: { id: doctorId }, select: DOCTOR_BOOKABLE_SELECT });
  if (!isDoctorBookable(doctor)) {
    return NextResponse.json({ error: UNBOOKABLE_MESSAGE }, { status: 404 });
  }

  try {
    const saved = await prisma.savedDoctor.create({
      data: { patientId: authUser.id, doctorId },
    });
    return NextResponse.json(saved);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ ok: true, alreadySaved: true });
    }
    throw err;
  }
});
