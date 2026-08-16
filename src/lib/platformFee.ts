type CommissionRates = {
  clinicCommissionPercent: number;
  videoCommissionPercent: number;
  homeCommissionPercent: number;
};

// Platform commission varies by consultation type — each doctor's fee is
// split at a different rate depending on whether it's a clinic visit,
// video call, or home visit.
export function commissionPercentForConsultType(
  settings: CommissionRates | null,
  consultType: string
): number {
  if (!settings) return 10;
  if (consultType === "VIDEO") return settings.videoCommissionPercent;
  if (consultType === "HOME") return settings.homeCommissionPercent;
  return settings.clinicCommissionPercent;
}
