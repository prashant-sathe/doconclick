"use client";

// A patient can browse doctors around a place other than where they are —
// e.g. booking for a relative in another city. The chosen location is kept in
// sessionStorage so it survives a reload and is shared between the map
// (/patient/dashboard) and the booking page (/patient/book). Absence means
// "use my current location (GPS)".

const KEY = "doconclick_patient_location";
export const PATIENT_LOCATION_EVENT = "patient-location-change";

export type PatientLocation = { lat: number; lng: number; label: string };

export function readPatientLocation(): PatientLocation | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.lat === "number" && typeof p?.lng === "number") {
      return {
        lat: p.lat,
        lng: p.lng,
        label: typeof p.label === "string" && p.label.trim() ? p.label : "Custom location",
      };
    }
  } catch {
    /* unavailable / corrupt — treat as unset */
  }
  return null;
}

export function writePatientLocation(loc: PatientLocation | null): void {
  try {
    if (loc) sessionStorage.setItem(KEY, JSON.stringify(loc));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode etc. — the in-memory state still updates via the event */
  }
  // `storage` events don't fire in the tab that made the change, so use a
  // plain custom event for same-page listeners.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PATIENT_LOCATION_EVENT));
  }
}
