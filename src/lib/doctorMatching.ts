import { prisma } from "@/lib/prisma";
import { haversine } from "@/lib/geo";
import { findOpenClinic } from "@/lib/clinicAvailability";

export interface ReassignmentCandidate {
  id: string;
  name: string;
  clinicId: string | null;
  fee: number;
}

// If the cancelled appointment was with a doctor this close to the patient, the
// replacement doctor must be within the same range — the patient booked local,
// so keep them local rather than shunting them to a far-away clinic/home visit.
const LOCAL_REASSIGN_RADIUS_KM = 20;

// Finds the nearest doctor who can take over a cancelled appointment: same
// specialty as the original doctor, offers the same consult type, and is
// currently reachable/open for it — excluding the doctor who cancelled.
export async function findReassignmentDoctor(params: {
  excludeDoctorId: string;
  specialty: string;
  consultType: string;
  patientId: string;
  now?: Date;
}): Promise<ReassignmentCandidate | null> {
  const { excludeDoctorId, specialty, consultType, patientId, now = new Date() } = params;

  const patientProfile = await prisma.patientProfile.findUnique({
    where: { userId: patientId },
    select: { lat: true, lng: true },
  });

  // Was the cancelled appointment a "local" one (patient and original doctor
  // within LOCAL_REASSIGN_RADIUS_KM)? If so, candidates must be local too.
  // Not applicable to VIDEO (remote) or when a location is unknown.
  let enforceLocalRadius = false;
  if (consultType !== "VIDEO" && patientProfile?.lat != null && patientProfile?.lng != null) {
    const originalDoctor = await prisma.user.findUnique({
      where: { id: excludeDoctorId },
      select: {
        doctorProfile: { select: { lat: true, lng: true } },
        clinics: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 1, select: { lat: true, lng: true } },
      },
    });
    const originalLat = originalDoctor?.doctorProfile?.lat ?? originalDoctor?.clinics[0]?.lat ?? null;
    const originalLng = originalDoctor?.doctorProfile?.lng ?? originalDoctor?.clinics[0]?.lng ?? null;
    if (originalLat != null && originalLng != null) {
      const originalDistanceKm = haversine(patientProfile.lat, patientProfile.lng, originalLat, originalLng);
      enforceLocalRadius = originalDistanceKm <= LOCAL_REASSIGN_RADIUS_KM;
    }
  }

  const doctors = await prisma.user.findMany({
    where: {
      role: "DOCTOR",
      deletedAt: null,
      id: { not: excludeDoctorId },
      doctorProfile: {
        status: "APPROVED",
        isVerified: true,
        specialty,
        OR: [{ trialEndsAt: { gt: now } }, { subscriptionPaidUntil: { gt: now } }],
      },
    },
    include: {
      doctorProfile: true,
      clinics: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { slots: true } },
    },
  });

  type Candidate = { id: string; name: string; distanceKm: number | null; clinicId: string | null; fee: number };
  const eligible: Candidate[] = [];

  for (const d of doctors) {
    const profile = d.doctorProfile;
    if (!profile) continue;

    const baseLat = profile.lat ?? d.clinics[0]?.lat ?? null;
    const baseLng = profile.lng ?? d.clinics[0]?.lng ?? null;
    const distanceKm =
      patientProfile?.lat != null && patientProfile?.lng != null && baseLat != null && baseLng != null
        ? haversine(patientProfile.lat, patientProfile.lng, baseLat, baseLng)
        : null;

    // Original appointment was local — a replacement further than 20 km (or of
    // unknown distance) isn't an acceptable stand-in.
    if (enforceLocalRadius && (distanceKm == null || distanceKm > LOCAL_REASSIGN_RADIUS_KM)) continue;

    if (consultType === "VIDEO") {
      if (profile.offersVideo !== true) continue;
      eligible.push({ id: d.id, name: d.name, distanceKm, clinicId: null, fee: profile.videoFee });
    } else if (consultType === "HOME") {
      if (!profile.offersHomeVisit) continue;
      if (distanceKm != null && distanceKm > profile.radius) continue;
      eligible.push({ id: d.id, name: d.name, distanceKm, clinicId: null, fee: profile.homeVisitFee });
    } else {
      if (profile.offersClinic === false) continue;
      const openClinic = findOpenClinic(d.clinics, now);
      if (!openClinic) continue;
      eligible.push({ id: d.id, name: d.name, distanceKm, clinicId: openClinic.id, fee: profile.consultFee });
    }
  }

  // Nearest first; doctors with unknown distance (no lat/lng on either side) sort last.
  eligible.sort((a, b) => {
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  const nearest = eligible[0];
  return nearest ? { id: nearest.id, name: nearest.name, clinicId: nearest.clinicId, fee: nearest.fee } : null;
}
