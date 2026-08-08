export interface PatientProfileData {
  location: string | null;
  homeAddress: string | null;
  pinCode: string | null;
  bloodGroup: string | null;
  height: number | null;
  weight: number | null;
  allergies: string | null;
  chronicDiseases: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoUrl: string | null;
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

export function computeCompleteness(profile: PatientProfileData | null | undefined): Completeness {
  const items: CompletenessItem[] = [
    { label: "Location", done: has(profile?.location) },
    { label: "Home Address", done: has(profile?.homeAddress) && has(profile?.pinCode) },
    { label: "Blood Group", done: has(profile?.bloodGroup) },
    { label: "Height & Weight", done: !!profile?.height && !!profile?.weight },
    { label: "Allergies", done: has(profile?.allergies) },
    { label: "Chronic Conditions", done: has(profile?.chronicDiseases) },
    { label: "Emergency Contact", done: has(profile?.emergencyContactName) && has(profile?.emergencyContactPhone) },
    { label: "Profile Photo", done: has(profile?.photoUrl) },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const totalCount = items.length;
  const percent = Math.round((completedCount / totalCount) * 100);

  return { percent, completedCount, totalCount, items };
}
