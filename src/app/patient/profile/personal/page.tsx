"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Droplets, Ruler, Weight, AlertTriangle, Pill, Scissors } from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import { usePatientProfile, patchPatientProfile } from "@/lib/usePatientProfile";
import { CHRONIC_OPTIONS, BLOOD_GROUPS } from "@/lib/medicalOptions";
import { computeBMI, bmiCategoryClasses } from "@/lib/bmi";
import { cn } from "@/lib/utils";

export default function PersonalSettingsPage() {
  const router = useRouter();
  const { profile, loading } = usePatientProfile();

  const [form, setForm] = useState({
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
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileSubShell
      title="Personal & Medical Info"
      description="Shared with the doctor you book so they can treat you safely."
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="input-label"><Droplets className="inline w-3.5 h-3.5 mr-1" />Blood Group</label>
          <select className="input-field" value={form.bloodGroup} onChange={(e) => set({ bloodGroup: e.target.value })}>
            <option value="">Select…</option>
            {BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="input-label"><Ruler className="inline w-3.5 h-3.5 mr-1" />Height (cm)</label>
          <input type="number" inputMode="numeric" className="input-field" placeholder="170" value={form.height} onChange={(e) => set({ height: e.target.value })} />
        </div>
        <div>
          <label className="input-label"><Weight className="inline w-3.5 h-3.5 mr-1" />Weight (kg)</label>
          <input type="number" inputMode="numeric" className="input-field" placeholder="70" value={form.weight} onChange={(e) => set({ weight: e.target.value })} />
        </div>
      </div>

      {bmi && (
        <div className={cn("rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-between", bmiCategoryClasses(bmi.category))}>
          <span>BMI: {bmi.value}</span>
          <span>{bmi.category}</span>
        </div>
      )}

      <div>
        <label className="input-label">Chronic Conditions</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {CHRONIC_OPTIONS.map((o) => (
            <button key={o} type="button" onClick={() => toggleChronic(o)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                form.chronicDiseases.includes(o) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              )}>
              {o}
            </button>
          ))}
        </div>
        {form.chronicDiseases.includes("Other") && (
          <input className="input-field mt-2" placeholder="Please specify" value={form.otherChronicText} onChange={(e) => set({ otherChronicText: e.target.value })} />
        )}
      </div>

      <div>
        <label className="input-label"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" />Known Allergies</label>
        <input className="input-field" placeholder="e.g. Penicillin, Dust, Peanuts (or 'None')" value={form.allergies} onChange={(e) => set({ allergies: e.target.value })} />
      </div>

      <div>
        <label className="input-label"><Pill className="inline w-3.5 h-3.5 mr-1" />Current Medications (optional)</label>
        <input className="input-field" placeholder="e.g. Metformin 500mg" value={form.medications} onChange={(e) => set({ medications: e.target.value })} />
      </div>

      <div>
        <label className="input-label"><Scissors className="inline w-3.5 h-3.5 mr-1" />Previous Surgeries (optional)</label>
        <input className="input-field" placeholder="e.g. Appendectomy 2018" value={form.surgeries} onChange={(e) => set({ surgeries: e.target.value })} />
      </div>
    </ProfileSubShell>
  );
}
