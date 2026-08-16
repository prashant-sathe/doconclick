"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHRONIC_OPTIONS, BLOOD_GROUPS } from "@/lib/medicalOptions";

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

const EMPTY_FORM = {
  name: "", age: "", gender: "", bloodGroup: "", height: "", weight: "",
  allergies: "", chronicDiseases: [] as string[], medications: "", surgeries: "",
  emergencyContactName: "", emergencyContactPhone: "",
};

// Lets a patient pick a previously-saved family member for the currently
// selected relation, or add a new one inline (same medical fields as the
// patient's own profile) — used whenever booking is for someone other than
// the account holder, so the doctor later sees THAT person's info, not the
// account holder's.
export default function DependentPicker({ relation, selectedId, onSelect }: {
  relation: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/patients/me/dependents")
      .then((r) => (r.ok ? r.json() : []))
      .then(setDependents)
      .finally(() => setLoading(false));
  }, []);

  const matching = dependents.filter((d) => d.relation === relation);
  // Parent remounts this component (via `key={relation}`) whenever the
  // selected relation changes, so `adding`/`form` naturally reset — no effect
  // needed. Only fall back to the add-form automatically once loading
  // finishes and there's nothing saved yet for this relation.
  const showAddForm = adding || (!loading && matching.length === 0);

  const set = (k: Exclude<keyof typeof EMPTY_FORM, "chronicDiseases">, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleChronic = (o: string) => {
    setForm((f) => ({
      ...f,
      chronicDiseases: f.chronicDiseases.includes(o)
        ? f.chronicDiseases.filter((x) => x !== o)
        : [...f.chronicDiseases, o],
    }));
  };

  const saveNew = async () => {
    if (!form.name.trim()) { setError("Please enter a name."); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/patients/me/dependents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, chronicDiseases: form.chronicDiseases.join(","), relation }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Could not save."); return; }
    setDependents((d) => [data, ...d]);
    onSelect(data.id);
    setAdding(false);
  };

  const deleteDependent = async (id: string) => {
    setDeletingId(id);
    const res = await fetch(`/api/patients/me/dependents/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      setDependents((d) => d.filter((x) => x.id !== id));
      if (selectedId === id) onSelect(null);
      setConfirmDeleteId(null);
    }
  };

  if (loading) return <p className="text-xs text-slate-400">Loading saved family members…</p>;

  return (
    <div className="space-y-3">
      {matching.length > 0 && !showAddForm && (
        <div className="space-y-2">
          {matching.map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                className={cn(
                  "flex-1 min-w-0 text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all",
                  selectedId === d.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                )}
              >
                {d.name}
                {d.bloodGroup && <span className="text-xs font-normal text-slate-400 ml-1.5">· {d.bloodGroup}</span>}
              </button>
              {confirmDeleteId === d.id ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={() => deleteDependent(d.id)} disabled={deletingId === d.id}
                    className="text-xs font-semibold text-red-600 px-2 py-2 rounded-lg hover:bg-red-50">
                    {deletingId === d.id ? "…" : "Delete"}
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(null)}
                    className="text-xs font-semibold text-slate-400 px-2 py-2 rounded-lg hover:bg-slate-100">
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDeleteId(d.id)} aria-label={`Delete ${d.name}`}
                  className="flex-shrink-0 p-2.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => { setAdding(true); onSelect(null); }} className="text-xs text-blue-600 font-semibold hover:underline">
            + Add another {relation.toLowerCase()}
          </button>
        </div>
      )}

      {showAddForm && (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
          <input required className="input-field" placeholder={`${relation}'s name`} value={form.name} onChange={(e) => set("name", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input-field" type="number" placeholder="Age" value={form.age} onChange={(e) => set("age", e.target.value)} />
            <select className="input-field" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select className="input-field" value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
              <option value="">Blood Group</option>
              {BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
            </select>
            <input className="input-field" type="number" placeholder="Height (cm)" value={form.height} onChange={(e) => set("height", e.target.value)} />
            <input className="input-field" type="number" placeholder="Weight (kg)" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
          </div>
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
          </div>
          <textarea className="input-field resize-none" rows={2} placeholder="Known allergies" value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
          <textarea className="input-field resize-none" rows={2} placeholder="Current medications" value={form.medications} onChange={(e) => set("medications", e.target.value)} />
          <textarea className="input-field resize-none" rows={2} placeholder="Past surgeries" value={form.surgeries} onChange={(e) => set("surgeries", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input-field" placeholder="Emergency contact name" value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} />
            <input className="input-field" placeholder="Emergency contact phone" value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            {matching.length > 0 && (
              <button type="button" onClick={() => setAdding(false)} className="btn-secondary py-2 px-3 text-xs flex-1">Cancel</button>
            )}
            <button type="button" onClick={saveNew} disabled={saving} className="btn-primary py-2 px-3 text-xs flex-1">
              {saving ? "Saving…" : `Save ${relation}'s Details`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
