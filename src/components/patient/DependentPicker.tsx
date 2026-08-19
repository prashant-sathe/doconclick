"use client";
import { useEffect, useState } from "react";
import { Trash2, Pencil } from "lucide-react";
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
  allergies: "", chronicDiseases: [] as string[], otherChronicText: "", medications: "", surgeries: "",
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
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const showAddForm = adding || editingId !== null || (!loading && matching.length === 0);

  const set = (k: Exclude<keyof typeof EMPTY_FORM, "chronicDiseases">, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleChronic = (o: string) => {
    setForm((f) => {
      const nowSelected = f.chronicDiseases.includes(o);
      return {
        ...f,
        chronicDiseases: nowSelected
          ? f.chronicDiseases.filter((x) => x !== o)
          : [...f.chronicDiseases, o],
        otherChronicText: o === "Other" && nowSelected ? "" : f.otherChronicText,
      };
    });
  };

  const startEdit = (d: Dependent) => {
    const loaded: string[] = d.chronicDiseases ? d.chronicDiseases.split(",").filter(Boolean) : [];
    const known = new Set(CHRONIC_OPTIONS);
    const custom = loaded.find((x) => !known.has(x));
    setForm({
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
    });
    setError("");
    setEditingId(d.id);
    setAdding(false);
  };

  const cancelForm = () => {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const saveNew = async () => {
    if (!form.name.trim()) { setError("Please enter a name."); return; }
    setSaving(true);
    setError("");
    const serializedChronic = form.chronicDiseases
      .map((o) => (o === "Other" ? form.otherChronicText.trim() : o))
      .filter(Boolean)
      .join(",");
    const url = editingId ? `/api/patients/me/dependents/${editingId}` : "/api/patients/me/dependents";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, chronicDiseases: serializedChronic, relation }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Could not save."); return; }
    if (editingId) {
      setDependents((d) => d.map((x) => (x.id === data.id ? data : x)));
    } else {
      setDependents((d) => [data, ...d]);
    }
    onSelect(data.id);
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
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
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={() => startEdit(d)} aria-label={`Edit ${d.name}`}
                    className="p-2.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(d.id)} aria-label={`Delete ${d.name}`}
                    className="p-2.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => { setForm(EMPTY_FORM); setAdding(true); onSelect(null); }} className="text-xs text-blue-600 font-semibold hover:underline">
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
            {form.chronicDiseases.includes("Other") && (
              <input
                className="input-field mt-2"
                placeholder="Please specify"
                value={form.otherChronicText}
                onChange={(e) => set("otherChronicText", e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="input-label">Known Allergies</label>
            <textarea className="input-field resize-none" rows={2} placeholder="e.g. Penicillin, Dust, Peanuts (or 'None')" value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
          </div>
          <div>
            <label className="input-label">Current Medications</label>
            <textarea className="input-field resize-none" rows={2} placeholder="e.g. Metformin 500mg" value={form.medications} onChange={(e) => set("medications", e.target.value)} />
          </div>
          <div>
            <label className="input-label">Previous Surgeries</label>
            <textarea className="input-field resize-none" rows={2} placeholder="e.g. Appendectomy 2018" value={form.surgeries} onChange={(e) => set("surgeries", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Emergency Contact Name</label>
              <input className="input-field" placeholder="e.g. Priya Sharma" value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} />
            </div>
            <div>
              <label className="input-label">Emergency Contact Phone</label>
              <input className="input-field" placeholder="9800000000" value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            {(matching.length > 0 || editingId) && (
              <button type="button" onClick={cancelForm} className="btn-secondary py-2 px-3 text-xs flex-1">Cancel</button>
            )}
            <button type="button" onClick={saveNew} disabled={saving} className="btn-primary py-2 px-3 text-xs flex-1">
              {saving ? "Saving…" : editingId ? "Save Changes" : `Save ${relation}'s Details`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
