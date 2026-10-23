// A doctor's "nurse care needed" referral (NurseReferral) stands in for a
// prescription when the patient books a nurse — so it's only usable once
// its source consultation actually happened (COMPLETED). A referral on a
// consultation that was then cancelled, declined or expired is void; the
// doctor can delete it, but it never unlocks a booking either way.

export const REFERRAL_INACTIVE_CODE = "REFERRAL_INACTIVE";

/** A user-facing reason the referral can't be used yet / any more, or null. */
export function referralProblem(sourceStatus: string): string | null {
  if (sourceStatus === "COMPLETED") return null;
  if (sourceStatus === "SCHEDULED" || sourceStatus === "PENDING_APPROVAL") {
    return "Your doctor's nurse referral can be used once your consultation is completed.";
  }
  return "This nurse referral is no longer valid because the consultation it came from was cancelled.";
}

/** The patient push when a referral becomes bookable. */
export function referralPushCopy(doctorName: string, serviceName: string) {
  return {
    key: "nurseReferralRecommended" as const,
    values: { doctor: doctorName, service: serviceName },
    url: "/patient/appointments",
  };
}
