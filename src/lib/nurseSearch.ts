import { prisma } from "@/lib/prisma";
import { haversine, withinSearchRadius } from "@/lib/geo";
import { isNurseBookable } from "@/lib/providerGuard";
import { nursesBusyNow } from "@/lib/nurseSchedule";
import { awayAt } from "@/lib/timeOff";

// Bookable nurses offering one service, nearest first — shared by the
// patient's nurse page (/api/nurses/search) and the Health Assistant so both
// always show the same nurses. A nurse is only listed when the patient is
// inside her own travel radius (and the patient's search-range preference).
// Location: the given point, else the patient's saved home address.
export async function searchNurses(params: { patientId: string; serviceId: string; lat?: number | null; lng?: number | null }) {
  const { serviceId, patientId } = params;
  const [service, settings, patientProfile] = await Promise.all([
    prisma.nurseService.findFirst({ where: { id: serviceId, isActive: true } }),
    prisma.platformSettings.findFirst(),
    prisma.patientProfile.findUnique({
      where: { userId: patientId },
      select: { lat: true, lng: true, searchRadiusKm: true },
    }),
  ]);
  if (!service) return { service: null, nurses: [], needsLocation: false };

  const pLat = params.lat != null && Number.isFinite(params.lat) ? params.lat : patientProfile?.lat ?? null;
  const pLng = params.lng != null && Number.isFinite(params.lng) ? params.lng : patientProfile?.lng ?? null;

  // Without a location we'd list (and let them book) nurses from anywhere.
  if (pLat == null || pLng == null) {
    return { service, nurses: [], needsLocation: true };
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

  const [busy, away] = await Promise.all([nursesBusyNow(nurses.map((n) => n.id)), awayAt(nurses.map((n) => n.id))]);
  return {
    service,
    nurses: nurses.map((n) => {
      const a = away.get(n.id);
      // Away right now (time off / offline): still listed, bookable for a
      // later day — the booking route refuses the days they're off.
      return {
        ...n,
        busyNow: busy.has(n.id),
        awayNow: !!a,
        awayUntil: a ? (a.kind === "LEAVE" ? a.endDate : "today") : null,
      };
    }),
    needsLocation: false,
  };
}
