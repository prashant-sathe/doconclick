import { haversine } from "@/lib/geo";
import { searchAddress } from "@/lib/geocode";
import type { VisitSnapshot } from "@/lib/visitAddress";

// A home visit's coordinates decide whether the provider travels there (the
// radius check) and where they navigate to — so they can't simply be taken
// from the request (BUG-TRACKER #65): a modified app could send a far-away
// address with coordinates next to the provider. The coordinates are checked
// against the address itself:
//
//   • the patient's saved home address → its saved coordinates (themselves
//     checked when the address was saved, see patients/me); a pin more than
//     PROFILE_MATCH_KM from them is a mismatch;
//   • any other address → where the address geocodes to (server-side,
//     cached Nominatim; full text, then its locality, then the PIN code);
//     more than ADDRESS_MISMATCH_KM away is a mismatch. An address that can't
//     be located at all is refused — otherwise made-up text would pass.

export const PROFILE_MATCH_KM = 2;
// Generous: an address may only resolve to its locality/PIN area.
export const ADDRESS_MISMATCH_KM = 15;

export type VisitVerifyProblem = { error: string; code: "LOCATION_MISMATCH" | "ADDRESS_NOT_FOUND" | "GEOCODE_UNAVAILABLE"; status: number; distanceKm?: number };

type SavedAddress = { homeAddress: string | null; lat: number | null; lng: number | null } | null | undefined;

const normaliseAddress = (a: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Searches to try, most to least precise: the full text, its last parts (locality, city), the PIN code, the city alone. */
function candidateQueries(address: string, pinCode: string | null): string[] {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const queries = [address];
  if (parts.length > 3) queries.push(parts.slice(-3).join(", "));
  if (parts.length > 2) queries.push(parts.slice(-2).join(", "));
  if (pinCode) queries.push(`${pinCode}, India`);
  // Last resort: the town/city alone (an unknown street in a known town).
  if (parts.length > 1) queries.push(parts[parts.length - 1]);
  return [...new Set(queries.map((q) => q.trim()).filter((q) => q.length >= 3))];
}

/** Where an address is, or null if it can't be found. Throws if the geocoder can't be reached. */
export async function locateAddress(address: string, pinCode: string | null): Promise<{ lat: number; lng: number; matched: string } | null> {
  for (const q of candidateQueries(address, pinCode)) {
    const [first] = await searchAddress(q);
    if (first && Number.isFinite(first.lat) && Number.isFinite(first.lon)) return { lat: first.lat, lng: first.lon, matched: q };
  }
  return null;
}

/**
 * Checks a visit's coordinates against its address. Returns the snapshot to
 * book with (for the saved address, its saved coordinates) or a problem.
 * `coordsFromSaved`: the coordinates already came from the saved profile, not
 * the request — nothing to check.
 */
export async function verifyVisitCoordinates(
  visit: VisitSnapshot,
  saved: SavedAddress,
  { coordsFromSaved = false }: { coordsFromSaved?: boolean } = {},
): Promise<{ visit: VisitSnapshot } | { problem: VisitVerifyProblem }> {
  if (coordsFromSaved || visit.visitLat == null || visit.visitLng == null || !visit.visitAddress) return { visit };
  const { visitLat, visitLng, visitAddress } = visit;

  // The saved home address: its saved coordinates are the reference.
  if (saved?.homeAddress && saved.lat != null && saved.lng != null && normaliseAddress(saved.homeAddress) === normaliseAddress(visitAddress)) {
    const d = haversine(visitLat, visitLng, saved.lat, saved.lng);
    if (d > PROFILE_MATCH_KM) {
      return { problem: {
        error: `The location sent is ${d.toFixed(1)} km from your saved home address. Pick the address again from the suggestions, or update it in Profile → Address.`,
        code: "LOCATION_MISMATCH", status: 409, distanceKm: d,
      } };
    }
    return { visit: { ...visit, visitLat: saved.lat, visitLng: saved.lng } };
  }

  // Any other address: where does it actually geocode to?
  let located;
  try {
    located = await locateAddress(visitAddress, visit.visitPinCode);
  } catch {
    return { problem: { error: "We couldn't check the visit address right now — please try again in a moment.", code: "GEOCODE_UNAVAILABLE", status: 503 } };
  }
  if (!located) {
    return { problem: {
      error: "We couldn't find that address on the map. Please pick it from the suggestions (or use your current location).",
      code: "ADDRESS_NOT_FOUND", status: 409,
    } };
  }
  const d = haversine(visitLat, visitLng, located.lat, located.lng);
  if (d > ADDRESS_MISMATCH_KM) {
    return { problem: {
      error: `The pinned location is ${d.toFixed(0)} km from the address you entered. Pick the address again from the suggestions so they match.`,
      code: "LOCATION_MISMATCH", status: 409, distanceKm: d,
    } };
  }
  return { visit };
}
