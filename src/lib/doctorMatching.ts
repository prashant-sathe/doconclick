import { prisma } from "@/lib/prisma";
import { bookableDoctorWhere } from "@/lib/doctorBookable";
import { haversine } from "@/lib/geo";
import { findOpenClinic } from "@/lib/clinicAvailability";
import { isDoctorAvailableNow } from "@/lib/availability";

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

// Every doctor who could take over a cancelled appointment, nearest first:
// same specialty as the original doctor, offers the same consult type, and
// works at `when` — the appointment's own time for a booking at a chosen
// time, or now for a "book now" request. For a clinic visit that's one of
// their clinics open then (hours and leave days); for home/video, their
// set available hours. Excludes the doctor who cancelled. The caller still
// checks each one's calendar for a clash (src/lib/reassignment.ts).
export async function findReassignmentCandidates(params: {
  excludeDoctorId: string;
  specialty: string;
  consultType: string;
  patientId: string;
  // Where the visit happens (a HOME booking's snapshot); defaults to the
  // patient's saved profile location.
  visitLocation?: { lat: number; lng: number };
  when?: Date;
}): Promise<ReassignmentCandidate[]> {
  const { excludeDoctorId, specialty, consultType, patientId, visitLocation, when = new Date() } = params;

  const patientProfile = visitLocation ?? await prisma.patientProfile.findUnique({
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
    where: { ...bookableDoctorWhere({ specialty }), id: { not: excludeDoctorId } },
    include: {
      doctorProfile: true,
      clinics: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { slots: true, leaves: { select: { date: true } } } },
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
      if (!isDoctorAvailableNow(profile.availability, when)) continue;
      eligible.push({ id: d.id, name: d.name, distanceKm, clinicId: null, fee: profile.videoFee });
    } else if (consultType === "HOME") {
      if (!profile.offersHomeVisit) continue;
      if (distanceKm != null && distanceKm > profile.radius) continue;
      if (!isDoctorAvailableNow(profile.availability, when)) continue;
      eligible.push({ id: d.id, name: d.name, distanceKm, clinicId: null, fee: profile.homeVisitFee });
    } else {
      if (profile.offersClinic === false) continue;
      const openClinic = findOpenClinic(d.clinics.map((c) => ({ ...c, leaves: c.leaves.map((l) => l.date) })), when);
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

  return eligible.map((c) => ({ id: c.id, name: c.name, clinicId: c.clinicId, fee: c.fee }));
}
