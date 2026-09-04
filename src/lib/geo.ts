// Great-circle distance between two lat/lng points, in kilometers.
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Lower/upper bounds for the patient's "doctor search range" preference. */
export const SEARCH_RADIUS_MIN_KM = 1;
export const SEARCH_RADIUS_MAX_KM = 100;

/**
 * Normalises a raw `searchRadiusKm` value (from a form or the DB) to either a
 * clamped integer in [MIN, MAX] or `null` meaning "Any distance / no limit".
 */
export function normalizeSearchRadiusKm(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(SEARCH_RADIUS_MAX_KM, Math.max(SEARCH_RADIUS_MIN_KM, n));
}

/**
 * Whether a doctor passes the patient's search-radius preference.
 *
 * - no preference set (`null`) → always shown
 * - doctor offers video → always shown (video is location-independent)
 * - distance unknown (patient or doctor has no coordinates) → shown, so a
 *   missing pin never silently hides a doctor
 * - otherwise shown only when within the radius
 */
export function withinSearchRadius(
  distanceKm: number | null | undefined,
  radiusKm: number | null | undefined,
  offersVideo: boolean,
): boolean {
  if (radiusKm == null) return true;
  if (offersVideo) return true;
  if (distanceKm == null) return true;
  return distanceKm <= radiusKm;
}
