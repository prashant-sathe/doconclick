import type { Prisma } from "@/generated/prisma/client";

// What the public doctor endpoints (/api/doctors, /api/doctors/[id]) return —
// an explicit allow-list, so a new DoctorProfile column (bank, KYC, payment
// ids, subscription/trial state…) stays private until it's added here.
export const PUBLIC_DOCTOR_PROFILE_SELECT = {
  photoUrl: true,
  clinicName: true,
  clinicPhotoUrl: true,
  qualification: true,
  medRegNo: true, // shown on the profile, as on the public NMC register
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
} satisfies Prisma.DoctorProfileSelect;

export const PUBLIC_CLINIC_SELECT = {
  id: true,
  name: true,
  address: true,
  photoUrl: true,
  lat: true,
  lng: true,
  sortOrder: true,
  slots: { select: { id: true, dayOfWeek: true, fromTime: true, toTime: true } },
} satisfies Prisma.ClinicSelect;

/** The doctor's home-visit base (profile lat/lng) can be where they live, so
 *  it's only published to ~1 km (2 decimals) — enough for the distance and
 *  search-radius filters; booking checks the exact radius server-side.
 *  Clinic coordinates are public addresses and stay exact. */
export function coarsenBase<T extends { lat: number | null; lng: number | null }>(p: T): T {
  const r = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
  return { ...p, lat: r(p.lat), lng: r(p.lng) };
}
