"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Droplets, Ruler, Weight, AlertTriangle, Pill, Scissors, HeartPulse } from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import { usePatientProfile, patchPatientProfile } from "@/lib/usePatientProfile";
import { CHRONIC_OPTIONS, BLOOD_GROUPS } from "@/lib/medicalOptions";
import { computeBMI, bmiCategoryClasses } from "@/lib/bmi";
import { cn } from "@/lib/utils";
import { GENDERS } from "@/lib/bookingProfile";
import { useTranslations } from "next-intl";

// Stored values stay English; labels come from booking.common.chronic.
const CHRONIC_KEY = {
  Diabetes: "diabetes", Hypertension: "hypertension", Asthma: "asthma", "Heart Disease": "heartDisease",
  Thyroid: "thyroid", Arthritis: "arthritis", COPD: "copd", Other: "other", None: "none",
} as const;

export default function PersonalSettingsPage() {
  const router = useRouter();
  const { profile, loading } = usePatientProfile();
  const t = useTranslations("patientAccount.personal");
  const ts = useTranslations("patientAccount.shell");
  const tc = useTranslations("booking.common");
  const chronicLabel = (o: string) =>
    o in CHRONIC_KEY ? tc(`chronic.${CHRONIC_KEY[o as keyof typeof CHRONIC_KEY]}`) : o;

  const [form, setForm] = useState({
    age: "", gender: "",
    bloodGroup: "", height: "", weight: "", allergies: "",
    chronicDiseases: [] as string[], otherChronicText: "",
    medications: "", surgeries: "",
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    const loaded: string[] = profile.chronicDiseases ? profile.chronicDiseases.split(",").filter(Boolean) : [];
    const known = new Set(CHRONIC_OPTIONS);
    const custom = loaded.find((x) => !known.has(x));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      // age 0 / gender "" = not filled yet (quick signup).
      age: typeof profile.age === "number" && profile.age > 0 ? String(profile.age) : "",
      gender: typeof profile.gender === "string" ? profile.gender : "",
      bloodGroup: profile.bloodGroup ?? "",
      height: profile.height != null ? String(profile.height) : "",
      weight: profile.weight != null ? String(profile.weight) : "",
      allergies: profile.allergies ?? "",
      chronicDiseases: custom ? [...loaded.filter((x) => known.has(x)), "Other"] : loaded,
      otherChronicText: custom ?? "",
      medications: profile.medications ?? "",
      surgeries: profile.surgeries ?? "",
    });
  }, [profile]);

  const set = (patch: Partial<typeof form>) => { setDirty(true); setSaved(false); setForm((f) => ({ ...f, ...patch })); };
  const toggleChronic = (o: string) => {
    setDirty(true); setSaved(false);
    setForm((f) => {
      const on = f.chronicDiseases.includes(o);
      return {
        ...f,
        chronicDiseases: on ? f.chronicDiseases.filter((x) => x !== o) : [...f.chronicDiseases, o],
        otherChronicText: o === "Other" && on ? "" : f.otherChronicText,
      };
    });
  };

  const bmi = computeBMI(Number(form.height), Number(form.weight));

  const save = async () => {
    setSaving(true);
    setError("");
    const chronic = form.chronicDiseases
      .map((o) => (o === "Other" ? form.otherChronicText.trim() : o))
      .filter(Boolean)
      .join(",");
    try {
      await patchPatientProfile({
        // Required to book, so they can be changed but never cleared.
        ...(form.age ? { age: Number(form.age) } : {}),
        ...(form.gender ? { gender: form.gender } : {}),
        bloodGroup: form.bloodGroup || null,
        height: form.height || null,
        weight: form.weight || null,
        allergies: form.allergies || null,
        chronicDiseases: chronic,
        medications: form.medications || null,
        surgeries: form.surgeries || null,
      });
      setSaved(true);
      setDirty(false);
      setTimeout(() => router.push("/patient/profile"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : ts("couldNotSave"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<HeartPulse className="w-5 h-5" />}
      tint="bg-red-50 text-red-500"
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="input-label">{t("age")}</label>
          <input type="number" inputMode="numeric" min={1} max={120} className="input-field" placeholder="30" value={form.age} onChange={(e) => set({ age: e.target.value })} />
        </div>
        <div>
          <label className="input-label">{t("gender")}</label>
          <select className="input-field" value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
            <option value="">{t("select")}</option>
            {GENDERS.map((g) => <option key={g} value={g}>{tc(`gender.${g}`)}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="input-label"><Droplets className="inline w-3.5 h-3.5 mr-1" />{t("bloodGroup")}</label>
          <select className="input-field" value={form.bloodGroup} onChange={(e) => set({ bloodGroup: e.target.value })}>
            <option value="">{t("select")}</option>
            {BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="input-label"><Ruler className="inline w-3.5 h-3.5 mr-1" />{t("height")}</label>
          <input type="number" inputMode="numeric" className="input-field" placeholder="170" value={form.height} onChange={(e) => set({ height: e.target.value })} />
        </div>
        <div>
          <label className="input-label"><Weight className="inline w-3.5 h-3.5 mr-1" />{t("weight")}</label>
          <input type="number" inputMode="numeric" className="input-field" placeholder="70" value={form.weight} onChange={(e) => set({ weight: e.target.value })} />
        </div>
      </div>

      {bmi && (
        <div className={cn("rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-between", bmiCategoryClasses(bmi.category))}>
          <span>BMI: {bmi.value}</span>
          <span>{t(`bmiCategory.${bmi.category}`)}</span>
        </div>
      )}

      <div>
        <label className="input-label">{t("chronic")}</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {CHRONIC_OPTIONS.map((o) => (
            <button key={o} type="button" onClick={() => toggleChronic(o)}
              className={cn("min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                form.chronicDiseases.includes(o) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              )}>
              {chronicLabel(o)}
            </button>
          ))}
        </div>
        {form.chronicDiseases.includes("Other") && (
          <input className="input-field mt-2" placeholder={t("specify")} value={form.otherChronicText} onChange={(e) => set({ otherChronicText: e.target.value })} />
        )}
      </div>

      <div>
        <label className="input-label"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" />{t("allergies")}</label>
        <input className="input-field" placeholder={t("allergiesPlaceholder")} value={form.allergies} onChange={(e) => set({ allergies: e.target.value })} />
      </div>

      <div>
        <label className="input-label"><Pill className="inline w-3.5 h-3.5 mr-1" />{t("medications")}</label>
        <input className="input-field" placeholder={t("medicationsPlaceholder")} value={form.medications} onChange={(e) => set({ medications: e.target.value })} />
      </div>

      <div>
        <label className="input-label"><Scissors className="inline w-3.5 h-3.5 mr-1" />{t("surgeries")}</label>
        <input className="input-field" placeholder={t("surgeriesPlaceholder")} value={form.surgeries} onChange={(e) => set({ surgeries: e.target.value })} />
      </div>
    </ProfileSubShell>
  );
}
