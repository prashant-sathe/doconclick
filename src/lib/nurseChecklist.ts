// What a nurse must fill in before the admin can review them. Client-safe —
// shared by the nurse's profile page, dashboard banner and the admin page.

export type NurseChecklistInput = {
  qualification?: string | null;
  councilRegNo?: string | null;
  councilCertUrl?: string | null;
  degreeCertUrl?: string | null;
  kycDocUrl?: string | null;
  photoUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  bankDetails?: string | null;
  serviceCount: number;
};

export function nurseChecklist(p: NurseChecklistInput) {
  const items = [
    { key: "qualification", label: "Qualification", done: !!p.qualification },
    { key: "council", label: "Nursing Council registration number", done: !!p.councilRegNo },
    { key: "councilCert", label: "Council registration certificate", done: !!p.councilCertUrl },
    { key: "degreeCert", label: "Degree / diploma certificate", done: !!p.degreeCertUrl },
    { key: "kyc", label: "Aadhaar / PAN (KYC)", done: !!p.kycDocUrl },
    { key: "photo", label: "Profile photo", done: !!p.photoUrl },
    { key: "services", label: "At least one service with your price", done: p.serviceCount > 0 },
    { key: "location", label: "Your base location", done: p.lat != null && p.lng != null },
    { key: "bank", label: "Bank details for payouts", done: !!p.bankDetails?.trim() },
  ];
  const doneCount = items.filter((i) => i.done).length;
  return { items, doneCount, complete: doneCount === items.length, percent: Math.round((doneCount / items.length) * 100) };
}
