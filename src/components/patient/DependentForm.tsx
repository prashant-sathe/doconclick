"use client";
import { cn } from "@/lib/utils";
import { CHRONIC_OPTIONS, BLOOD_GROUPS } from "@/lib/medicalOptions";
import { useTranslations } from "next-intl";

// A saved family member (PatientDependent) and the medical-details form for
// one — shared by the booking flow's DependentPicker and the profile's
// Family members screens, so both edit the same fields the same way.

export interface Dependent {
  id: string;
  name: string;
  relation: string;
  age: number | null;
  gender: string | null;
  bloodGroup: string | null;
  height: number | null;
  weight: number | null;
  allergies: string | null;
  chronicDiseases: string | null;
  medications: string | null;
  surgeries: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

// Display labels for the stored (English) chronic-condition values.
const CHRONIC_KEY = {
  Diabetes: "diabetes", Hypertension: "hypertension", Asthma: "asthma", "Heart Disease": "heartDisease",
  Thyroid: "thyroid", Arthritis: "arthritis", COPD: "copd", Other: "other", None: "none",
} as const;

export const EMPTY_DEPENDENT_FORM = {
  name: "", age: "", gender: "", bloodGroup: "", height: "", weight: "",
  allergies: "", chronicDiseases: [] as string[], otherChronicText: "", medications: "", surgeries: "",
  emergencyContactName: "", emergencyContactPhone: "",
};
export type DependentFormValues = typeof EMPTY_DEPENDENT_FORM;

/** A saved dependent as form values — a condition outside CHRONIC_OPTIONS becomes "Other" + its text. */
export function dependentToForm(d: Dependent): DependentFormValues {
  const loaded: string[] = d.chronicDiseases ? d.chronicDiseases.split(",").filter(Boolean) : [];
  const known = new Set(CHRONIC_OPTIONS);
  const custom = loaded.find((x) => !known.has(x));
  return {
    name: d.name,
    age: d.age != null ? String(d.age) : "",
    gender: d.gender ?? "",
    bloodGroup: d.bloodGroup ?? "",
    height: d.height != null ? String(d.height) : "",
    weight: d.weight != null ? String(d.weight) : "",
    allergies: d.allergies ?? "",
    chronicDiseases: custom ? [...loaded.filter((x) => known.has(x)), "Other"] : loaded,
    otherChronicText: custom ?? "",
    medications: d.medications ?? "",
    surgeries: d.surgeries ?? "",
    emergencyContactName: d.emergencyContactName ?? "",
    emergencyContactPhone: d.emergencyContactPhone ?? "",
  };
}

/** The request body for POST/PATCH /api/patients/me/dependents (chronic conditions as one CSV). */
export function dependentFormBody(form: DependentFormValues) {
  const { otherChronicText, ...rest } = form;
  const chronicDiseases = form.chronicDiseases
    .map((o) => (o === "Other" ? otherChronicText.trim() : o))
    .filter(Boolean)
    .join(",");
  return { ...rest, chronicDiseases };
}

/** Every field but the relation, which each caller handles its own way. */
export function DependentFields({ form, onChange, namePlaceholder, showLabels = false }: {
  form: DependentFormValues;
  onChange: (next: DependentFormValues) => void;
  namePlaceholder: string;
  /** Labels above name/age/gender/vitals too (the full-page form); booking's compact form uses placeholders. */
  showLabels?: boolean;
}) {
  const t = useTranslations("booking.dependents");
  const tc = useTranslations("booking.common");
  const chronicLabel = (o: string) =>
    o in CHRONIC_KEY ? tc(`chronic.${CHRONIC_KEY[o as keyof typeof CHRONIC_KEY]}`) : o;
  const set = (k: Exclude<keyof DependentFormValues, "chronicDiseases">, v: string) => onChange({ ...form, [k]: v });
  const toggleChronic = (o: string) => {
    const nowSelected = form.chronicDiseases.includes(o);
    onChange({
      ...form,
      chronicDiseases: nowSelected ? form.chronicDiseases.filter((x) => x !== o) : [...form.chronicDiseases, o],
      otherChronicText: o === "Other" && nowSelected ? "" : form.otherChronicText,
    });
  };
  const label = (text: string) => (showLabels ? <label className="input-label">{text}</label> : null);

  return (
    <>
      <div>
        {label(t("name"))}
        <input required className="input-field" placeholder={namePlaceholder} value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          {label(t("age"))}
          <input className="input-field" type="number" inputMode="numeric" placeholder={t("age")} value={form.age} onChange={(e) => set("age", e.target.value)} />
        </div>
        <div>
          {label(t("gender"))}
          <select className="input-field" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">{t("gender")}</option>
            <option value="Male">{tc("gender.Male")}</option>
            <option value="Female">{tc("gender.Female")}</option>
            <option value="Other">{tc("gender.Other")}</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          {label(t("bloodGroup"))}
          <select className="input-field" value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
            <option value="">{t("bloodGroup")}</option>
            {BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          {label(t("height"))}
          <input className="input-field" type="number" inputMode="numeric" placeholder={t("height")} value={form.height} onChange={(e) => set("height", e.target.value)} />
        </div>
        <div>
          {label(t("weight"))}
          <input className="input-field" type="number" inputMode="numeric" placeholder={t("weight")} value={form.weight} onChange={(e) => set("weight", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="input-label">{t("chronic")}</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {CHRONIC_OPTIONS.map((o) => (
            <button key={o} type="button" onClick={() => toggleChronic(o)} aria-pressed={form.chronicDiseases.includes(o)}
              className={cn("min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                form.chronicDiseases.includes(o) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              )}>
              {chronicLabel(o)}
            </button>
          ))}
        </div>
        {form.chronicDiseases.includes("Other") && (
          <input
            className="input-field mt-2"
            placeholder={t("specify")}
            value={form.otherChronicText}
            onChange={(e) => set("otherChronicText", e.target.value)}
          />
        )}
      </div>
      <div>
        <label className="input-label">{t("allergies")}</label>
        <textarea className="input-field resize-none" rows={2} placeholder={t("allergiesPlaceholder")} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
      </div>
      <div>
        <label className="input-label">{t("medications")}</label>
        <textarea className="input-field resize-none" rows={2} placeholder={t("medicationsPlaceholder")} value={form.medications} onChange={(e) => set("medications", e.target.value)} />
      </div>
      <div>
        <label className="input-label">{t("surgeries")}</label>
        <textarea className="input-field resize-none" rows={2} placeholder={t("surgeriesPlaceholder")} value={form.surgeries} onChange={(e) => set("surgeries", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="input-label">{t("emergencyName")}</label>
          <input className="input-field" placeholder={t("emergencyNamePlaceholder")} value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} />
        </div>
        <div>
          <label className="input-label">{t("emergencyPhone")}</label>
          <input className="input-field" type="tel" inputMode="numeric" placeholder="9800000000" value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} />
        </div>
      </div>
    </>
  );
}
