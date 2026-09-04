"use client";
import { useEffect, useState } from "react";

export type RawProfile = Record<string, unknown> & {
  photoUrl?: string | null;
  location?: string | null;
  homeAddress?: string | null;
  landmark?: string | null;
  pinCode?: string | null;
  bloodGroup?: string | null;
  height?: number | null;
  weight?: number | null;
  allergies?: string | null;
  chronicDiseases?: string | null;
  medications?: string | null;
  surgeries?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  lat?: number | null;
  lng?: number | null;
  searchRadiusKm?: number | null;
};

/** Loads the signed-in patient's profile once. */
export function usePatientProfile() {
  const [profile, setProfile] = useState<RawProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/patients/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setProfile((d?.patientProfile ?? {}) as RawProfile);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { profile, loading, setProfile };
}

/** PATCHes only the given fields. Throws with a user-facing message on failure. */
export async function patchPatientProfile(data: Record<string, unknown>): Promise<RawProfile> {
  const res = await fetch("/api/patients/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Could not save. Please try again.");
  }
  return res.json();
}
