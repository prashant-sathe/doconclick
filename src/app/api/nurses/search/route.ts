import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { haversine, withinSearchRadius } from "@/lib/geo";
import { isNurseBookable } from "@/lib/providerGuard";
import { nursesBusyNow } from "@/lib/nurseSchedule";

// GET ?serviceId=…&lat=…&lng=… — bookable nurses offering this service,
// nearest first. A nurse is only listed when the patient is inside the
// nurse's own travel radius (and the patient's search-range preference).
// Location comes from ?lat&lng, else the patient's saved home address.
export async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  if (!serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });

  const [service, settings, patientProfile] = await Promise.all([
    prisma.nurseService.findFirst({ where: { id: serviceId, isActive: true } }),
    prisma.platformSettings.findFirst(),
    prisma.patientProfile.findUnique({
      where: { userId: authUser.id },
      select: { lat: true, lng: true, searchRadiusKm: true },
    }),
  ]);
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  const qLat = Number(searchParams.get("lat"));
  const qLng = Number(searchParams.get("lng"));
  const pLat = searchParams.get("lat") && Number.isFinite(qLat) ? qLat : patientProfile?.lat ?? null;
  const pLng = searchParams.get("lng") && Number.isFinite(qLng) ? qLng : patientProfile?.lng ?? null;

  // Without a location we'd list (and let them book) nurses from anywhere.
  if (pLat == null || pLng == null) {
    return NextResponse.json({ service, nurses: [], needsLocation: true });
  }

  const offerings = await prisma.nurseServiceOffering.findMany({
    where: {
      serviceId,
      nurseProfile: { status: "APPROVED", user: { deletedAt: null } },
    },
    include: {
      nurseProfile: {
        select: {
          id: true, userId: true, photoUrl: true, qualification: true, experience: true, gender: true,
          languages: true, bio: true, radius: true, lat: true, lng: true, availability: true,
          isVerified: true, avgRating: true, totalReviews: true, status: true,
          registrationFeePaid: true, subscriptionPaidUntil: true, policeVerifUrl: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  const nurses = offerings
    .filter((o) => isNurseBookable(o.nurseProfile, settings))
    .map((o) => {
      const n = o.nurseProfile;
      const distanceKm = n.lat != null && n.lng != null ? haversine(pLat, pLng, n.lat, n.lng) : null;
      return {
        id: n.userId,
        name: n.user.name,
        photoUrl: n.photoUrl,
        qualification: n.qualification,
        experience: n.experience,
        gender: n.gender,
        languages: n.languages,
        bio: n.bio,
        availability: n.availability,
        isVerified: n.isVerified,
        policeVerified: !!n.policeVerifUrl && n.isVerified,
        avgRating: n.avgRating,
        totalReviews: n.totalReviews,
        radius: n.radius,
        price: o.price,
        distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
      };
    })
    .filter((n) => n.distanceKm != null && n.distanceKm <= n.radius)
    .filter((n) => withinSearchRadius(n.distanceKm, patientProfile?.searchRadiusKm, false))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

  const busy = await nursesBusyNow(nurses.map((n) => n.id));
  return NextResponse.json({ service, nurses: nurses.map((n) => ({ ...n, busyNow: busy.has(n.id) })) });
}
