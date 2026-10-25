// Shared types + pure helpers of the nurse dashboard (split out of
// src/app/nurse/dashboard/page.tsx; no behaviour change).
import type { useTranslations } from "next-intl";
import { VISIT_START_EARLY_MS, VISIT_START_LATE_MS, shiftCompletableAt } from "@/lib/nursePackage";
import type { VitalsInput } from "@/lib/vitals";

export type VitalRow = VitalsInput & { id: string; recordedAt: string; alertLevel: string; alerts: string | null };

export type Visit = {
  id: string;
  patientId: string;
  // Where to go: the address snapshotted at booking (profile for older rows).
  visit: { address: string | null; landmark: string | null; pinCode: string | null; lat: number | null; lng: number | null } | null;
  dependentId: string | null;
  vitals: VitalRow[];
  nurseService: { kind: string; durationMinutes: number } | null;
  status: string;
  serviceName: string | null;
  symptoms: string;
  patientName: string | null;
  relation: string;
  allergies: string | null;
  amount: number;
  platformFee: number;
  paymentStatus: string;
  travelStatus: string;
  scheduledAt: string;
  requestedScheduledAt: string | null;
  createdAt: string;
  doctorNotes: string | null;
  unreadMessageCount: number;
  patient: {
    name: string;
    mobile: string;
    patientProfile: { lat: number | null; lng: number | null; homeAddress: string | null; landmark: string | null; pinCode: string | null; age: number; gender: string } | null;
  };
  dependent: { age: number | null; gender: string | null } | null;
  prescriptionDoc: { title: string; fileUrl: string; fileName: string | null } | null;
  review: { rating: number; comment: string | null } | null;
  packageId: string | null;
  packageIndex: number | null;
  package: { visits: number; intervalDays: number } | null;
  visitStartedAt: string | null;
  visitStartNote: string | null;
  nurseReferral: {
    instructions: string | null;
    appointment: {
      scheduledAt: string;
      doctorNotes: string | null;
      doctor: { name: string };
      medicines: { name: string; dosage: string; frequency: string; duration: string; instructions: string | null }[];
    };
  } | null;
};

// Labels are message keys (messages/<locale>/nurse.json).
export const TABS = ["requests", "upcoming", "history"] as const;
export const STATUSES = ["COMPLETED", "CANCELLED", "REJECTED", "EXPIRED", "NO_SHOW"] as const;
export const RELATIONS = ["Self", "Spouse", "Son", "Daughter", "Father", "Mother", "Other"] as const;
export const GENDER_KEYS = ["Male", "Female", "Other"] as const;
export const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

export type CommonT = ReturnType<typeof useTranslations<"nurse.common">>;
export type DashT = ReturnType<typeof useTranslations<"nurse.dashboard">>;

export function patientLabel(v: Visit) {
  return v.relation !== "Self" && v.patientName ? v.patientName : v.patient.name;
}

export const relationLabel = (relation: string, tc: CommonT) => (isOneOf(RELATIONS, relation) ? tc(`relation.${relation}`) : relation);

export function ageGender(v: Visit, t: DashT, tc: CommonT) {
  const age = v.relation !== "Self" ? v.dependent?.age : v.patient.patientProfile?.age;
  const gender = v.relation !== "Self" ? v.dependent?.gender : v.patient.patientProfile?.gender;
  const genderLabel = gender ? (isOneOf(GENDER_KEYS, gender) ? tc(`gender.${gender}`) : gender) : null;
  return [age ? t("ageYears", { age }) : null, genderLabel].filter(Boolean).join(" · ");
}

// Same windows as visitStartProblem / shiftCompleteProblem (src/lib/nursePackage.ts),
// worded in the app's language.
export const fmtTimeIST = (d: Date, locale: string) =>
  d.toLocaleString(locale, { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function startWindowProblem(scheduledAt: Date, t: DashT, locale: string, now = new Date()): string | null {
  const at = scheduledAt.getTime();
  if (now.getTime() < at - VISIT_START_EARLY_MS) {
    return t("startEarly", { at: fmtTimeIST(scheduledAt, locale), from: fmtTimeIST(new Date(at - VISIT_START_EARLY_MS), locale) });
  }
  if (now.getTime() > at + VISIT_START_LATE_MS) return t("startLate");
  return null;
}

export function shiftWaitProblem(visitStartedAt: Date, durationMinutes: number, t: DashT, locale: string, now = new Date()): string | null {
  const ready = shiftCompletableAt(visitStartedAt, durationMinutes);
  if (now.getTime() >= ready.getTime()) return null;
  return t("shiftWait", { hours: Math.round(durationMinutes / 60), at: fmtTimeIST(ready, locale) });
}

// Directions to the address snapshotted when the visit was booked (the
// profile for older rows) — never the patient's current profile address.
export function directionsUrl(v: Visit) {
  const p = v.visit;
  if (p?.lat != null && p?.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  if (p?.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`;
  return null;
}
