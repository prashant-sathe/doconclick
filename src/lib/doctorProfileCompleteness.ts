export interface DoctorProfileData {
  qualification: string | null;
  medRegNo: string | null;
  experience: number;
  consultFee: number;
  bankDetails: string | null;
  photoUrl: string | null;
  medRegCertUrl: string | null;
  degreeCertUrl: string | null;
  kycDocUrl: string | null;
  lat: number | null;
  lng: number | null;
}

export interface CompletenessItem {
  label: string;
  done: boolean;
}

export interface Completeness {
  percent: number;
  completedCount: number;
  totalCount: number;
  items: CompletenessItem[];
}

function has(v: string | null | undefined): boolean {
  return !!v && v.trim().length > 0;
}

export function computeDoctorCompleteness(profile: DoctorProfileData | null | undefined): Completeness {
  const items: CompletenessItem[] = [
    { label: "Qualification", done: has(profile?.qualification) },
    { label: "Registration Number", done: has(profile?.medRegNo) },
    { label: "Experience & Fees", done: !!profile && profile.experience > 0 && profile.consultFee > 0 },
    { label: "Practice Location", done: profile?.lat != null && profile?.lng != null },
    { label: "Bank Details", done: has(profile?.bankDetails) },
    { label: "Profile Photo", done: has(profile?.photoUrl) },
    { label: "Registration Certificate", done: has(profile?.medRegCertUrl) },
    { label: "Medical Degree Certificate", done: has(profile?.degreeCertUrl) },
    { label: "KYC Document", done: has(profile?.kycDocUrl) },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const totalCount = items.length;
  const percent = Math.round((completedCount / totalCount) * 100);

  return { percent, completedCount, totalCount, items };
}
