"use client";
// Shared doctor-list filter/sort state for the patient map (dashboard) and
// plain-list (book) pages — kept as one pure module so the two flows stay
// at parity (per this app's "add booking features to both" convention)
// instead of drifting into two slightly different rule sets.

export type DoctorSortBy = "distance" | "rating" | "experience" | "feeLowToHigh";

export interface DoctorFilterState {
  language: string; // "" = any
  minExperience: number; // 0 = any
  maxFee: number | null; // null = any
  sortBy: DoctorSortBy;
}

export const DEFAULT_DOCTOR_FILTERS: DoctorFilterState = {
  language: "",
  minExperience: 0,
  maxFee: null,
  sortBy: "distance",
};

export function isDefaultDoctorFilters(f: DoctorFilterState): boolean {
  return f.language === "" && f.minExperience === 0 && f.maxFee == null;
}

// DoctorProfile.languages is a freeform "English, Hindi, Marathi" string —
// there's no fixed catalog to filter against (unlike specialty), so options
// are derived from whichever doctors are actually on screen.
export function splitLanguages(languages: string): string[] {
  return languages.split(",").map((s) => s.trim()).filter(Boolean);
}

export function collectAvailableLanguages(
  doctors: { doctorProfile: { languages: string } | null }[]
): string[] {
  const seen = new Set<string>();
  for (const d of doctors) {
    if (!d.doctorProfile) continue;
    for (const lang of splitLanguages(d.doctorProfile.languages)) seen.add(lang);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function matchesDoctorFilters(
  profile: { languages: string; experience: number; consultFee: number },
  filters: DoctorFilterState
): boolean {
  if (
    filters.language &&
    !splitLanguages(profile.languages).some((l) => l.toLowerCase() === filters.language.toLowerCase())
  ) {
    return false;
  }
  if (profile.experience < filters.minExperience) return false;
  // Filtered against the clinic-visit fee — the one consult fee every
  // doctor has (video/home are opt-in per doctor), so it's the only one
  // that's always meaningful to compare across the whole list.
  if (filters.maxFee != null && profile.consultFee > filters.maxFee) return false;
  return true;
}

// Kept in sessionStorage (not localStorage) — same choice as
// src/lib/patientLocation.ts and for the same reason: a filter picked for
// "doctors near me right now" shouldn't quietly carry over into a totally
// different future session, but it should absolutely survive switching bottom
// nav tabs and coming back, which unmounts/remounts this page's plain
// useState. Shared between /patient/dashboard and /patient/book so filtering
// on one carries over to the other, same as the search-location choice.
const STORAGE_KEY = "doconclick_doctor_filters";

export function readStoredDoctorFilters(): DoctorFilterState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.language === "string" &&
      typeof parsed?.minExperience === "number" &&
      (parsed?.maxFee === null || typeof parsed?.maxFee === "number") &&
      typeof parsed?.sortBy === "string"
    ) {
      return parsed as DoctorFilterState;
    }
  } catch {
    /* unavailable / corrupt — treat as unset */
  }
  return null;
}

export function writeStoredDoctorFilters(filters: DoctorFilterState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* private mode etc. — the in-memory state still updates */
  }
}

export function sortDoctors<T extends { distance?: number; doctorProfile: { avgRating: number; experience: number; consultFee: number } | null }>(
  doctors: T[],
  sortBy: DoctorSortBy
): T[] {
  const list = [...doctors];
  switch (sortBy) {
    case "rating":
      return list.sort((a, b) => (b.doctorProfile?.avgRating ?? 0) - (a.doctorProfile?.avgRating ?? 0));
    case "experience":
      return list.sort((a, b) => (b.doctorProfile?.experience ?? 0) - (a.doctorProfile?.experience ?? 0));
    case "feeLowToHigh":
      return list.sort((a, b) => (a.doctorProfile?.consultFee ?? 0) - (b.doctorProfile?.consultFee ?? 0));
    case "distance":
    default:
      return list.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }
}
