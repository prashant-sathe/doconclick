"use client";
import { useEffect, useState } from "react";

export type RawDoctorProfile = Record<string, unknown> & {
  specialty?: string | null;
  qualification?: string | null;
  languages?: string | null;
  bio?: string | null;
  medRegNo?: string | null;
  experience?: number | null;
  consultFee?: number | null;
  videoFee?: number | null;
  homeVisitFee?: number | null;
  offersHomeVisit?: boolean | null;
  offersClinic?: boolean | null;
  offersVideo?: boolean | null;
  radius?: number | null;
  availability?: string | null;
  bankDetails?: string | null;
  photoUrl?: string | null;
  medRegCertUrl?: string | null;
  degreeCertUrl?: string | null;
  kycDocUrl?: string | null;
  signatureUrl?: string | null;
  isVerified?: boolean | null;
  registrationFeePaid?: boolean | null;
  trialEndsAt?: string | null;
  subscriptionPaidUntil?: string | null;
};

export type DoctorMe = {
  doctorProfile: RawDoctorProfile;
  clinics: unknown[];
};

/** Loads the signed-in doctor's `/api/doctors/me` once. */
export function useDoctorProfile() {
  const [data, setData] = useState<DoctorMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/doctors/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setData({ doctorProfile: (d?.doctorProfile ?? {}) as RawDoctorProfile, clinics: d?.clinics ?? [] });
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return {
    profile: data?.doctorProfile ?? null,
    clinicCount: data?.clinics.length ?? 0,
    loading,
  };
}

/** PATCHes only the given fields. Throws with a user-facing message on failure. */
export async function patchDoctorProfile(fields: Record<string, unknown>): Promise<RawDoctorProfile> {
  const res = await fetch("/api/doctors/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Could not save. Please try again.");
  }
  return res.json();
}
