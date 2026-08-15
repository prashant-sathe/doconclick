// Shared by both the doctor-side access gates (dashboard/earnings/profile)
// and the patient-facing doctor listing filters — a doctor is bookable
// while either their free trial or their most recent paid month is current.
export function hasActiveDoctorSubscription(profile: {
  trialEndsAt: Date | string | null;
  subscriptionPaidUntil: Date | string | null;
}): boolean {
  const now = Date.now();
  if (profile.trialEndsAt && now < new Date(profile.trialEndsAt).getTime()) return true;
  if (profile.subscriptionPaidUntil && now < new Date(profile.subscriptionPaidUntil).getTime()) return true;
  return false;
}
