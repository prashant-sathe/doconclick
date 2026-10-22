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
  status?: string | null;
  bankDetailsUpdatedAt?: string | null;
  registrationFeePaid?: boolean | null;
  trialEndsAt?: string | null;
  subscriptionPaidUntil?: string | null;
};

// A verified doctor's request to change registration number / qualification
// / specialty — the latest one (PENDING, or the last APPROVED/REJECTED).
export type DoctorChangeRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  changes: Partial<Record<"medRegNo" | "qualification" | "specialty", { from: string | null; to: string | null }>>;
  reviewNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type DoctorMe = {
  doctorProfile: RawDoctorProfile;
  clinics: unknown[];
  changeRequest: DoctorChangeRequest | null;
  /** The admin-set one-time registration fee (₹0 = free). */
  registrationFee: number | null;
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
        setData({ doctorProfile: (d?.doctorProfile ?? {}) as RawDoctorProfile, clinics: d?.clinics ?? [], changeRequest: d?.changeRequest ?? null, registrationFee: typeof d?.registrationFee === "number" ? d.registrationFee : null });
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return {
    profile: data?.doctorProfile ?? null,
    clinicCount: data?.clinics.length ?? 0,
    changeRequest: data?.changeRequest ?? null,
    registrationFee: data?.registrationFee ?? null,
    loading,
  };
}

/** PATCHes only the given fields. Throws with a user-facing message on failure. */
export async function patchDoctorProfile(
  fields: Record<string, unknown>
): Promise<RawDoctorProfile & { changeRequest: DoctorChangeRequest | null }> {
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
