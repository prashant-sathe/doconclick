// Where a HOME visit (doctor or nurse) happens, snapshotted onto the
// Appointment at booking time: a patient editing their profile address later
// must never move a visit that's already booked.

export type VisitSnapshot = {
  visitAddress: string | null;
  visitLandmark: string | null;
  visitPinCode: string | null;
  visitLat: number | null;
  visitLng: number | null;
};

type ProfileAddress = {
  homeAddress: string | null;
  landmark: string | null;
  pinCode: string | null;
  lat: number | null;
  lng: number | null;
} | null | undefined;

const MAX_ADDRESS = 300;
const MAX_LANDMARK = 120;

const validCoord = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;

// The visit address a booking request sent: { address, landmark?, pinCode?,
// lat, lng }. The address must come with coordinates — picked from the
// suggestions or pinned by GPS — so a typed address can't be booked with no
// way to check the travel radius or navigate there. Absent → null (use the
// profile instead).
export function parseVisitInput(raw: unknown): { snapshot: VisitSnapshot } | { error: string } | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") return { error: "Invalid visit address." };
  const v = raw as Record<string, unknown>;
  const address = typeof v.address === "string" ? v.address.trim() : "";
  if (!address) return { error: "Please add the address for the visit." };
  if (address.length > MAX_ADDRESS) return { error: `Keep the address under ${MAX_ADDRESS} characters.` };
  if (!validCoord(v.lat, 90) || !validCoord(v.lng, 180)) {
    return { error: "Please pick the visit address from the suggestions (or use your current location) so we know exactly where to come." };
  }
  const landmark = typeof v.landmark === "string" ? v.landmark.trim().slice(0, MAX_LANDMARK) : "";
  const pinCode = typeof v.pinCode === "string" ? v.pinCode.trim() : "";
  if (pinCode && !/^\d{6}$/.test(pinCode)) return { error: "PIN code must be 6 digits." };
  return {
    snapshot: {
      visitAddress: address,
      visitLandmark: landmark || null,
      visitPinCode: pinCode || null,
      visitLat: v.lat,
      visitLng: v.lng,
    },
  };
}

// The saved profile address as a snapshot (fields that are missing stay null).
export function snapshotFromProfile(profile: ProfileAddress): VisitSnapshot {
  return {
    visitAddress: profile?.homeAddress?.trim() || null,
    visitLandmark: profile?.landmark?.trim() || null,
    visitPinCode: profile?.pinCode?.trim() || null,
    visitLat: profile?.lat ?? null,
    visitLng: profile?.lng ?? null,
  };
}

// Read side, for dashboards: the booking's own snapshot, or — for rows
// booked before snapshots existed — the patient's current profile address.
export function visitLocation(
  appt: Partial<VisitSnapshot> & { consultType: string },
  profile: ProfileAddress
): { address: string | null; landmark: string | null; pinCode: string | null; lat: number | null; lng: number | null; snapshot: boolean } | null {
  if (appt.consultType !== "HOME") return null;
  const hasSnapshot = appt.visitAddress != null || appt.visitLat != null;
  const s = hasSnapshot ? appt : snapshotFromProfile(profile);
  return {
    address: s.visitAddress ?? null,
    landmark: s.visitLandmark ?? null,
    pinCode: s.visitPinCode ?? null,
    lat: s.visitLat ?? null,
    lng: s.visitLng ?? null,
    snapshot: hasSnapshot,
  };
}

// Copies a booking's visit snapshot onto another Appointment (reassignment).
export function copyVisitSnapshot(appt: VisitSnapshot): VisitSnapshot {
  return {
    visitAddress: appt.visitAddress,
    visitLandmark: appt.visitLandmark,
    visitPinCode: appt.visitPinCode,
    visitLat: appt.visitLat,
    visitLng: appt.visitLng,
  };
}
