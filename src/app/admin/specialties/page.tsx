"use client";
import { useEffect, useState } from "react";
import { Tag, Plus, Trash2, Loader2, EyeOff, Eye, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpecialtyRow {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
}

export default function AdminSpecialties() {
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const load = () => {
    fetch("/api/admin/specialties")
      .then((r) => r.json())
      .then((d) => { setSpecialties(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const addSpecialty = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    const res = await fetch("/api/admin/specialties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    setAdding(false);
    if (res.ok) {
      setName("");
      setColor("#2563eb");
      load();
    } else {
      setAddError((await res.json().catch(() => ({}))).error ?? "Could not add specialty.");
    }
  };

  const toggleActive = async (s: SpecialtyRow) => {
    setBusyId(s.id);
    setRowError(null);
    await fetch(`/api/admin/specialties/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    setBusyId(null);
    load();
  };

  const deleteSpecialty = async (s: SpecialtyRow) => {
    if (!confirm(`Delete "${s.name}"?`)) return;
    setBusyId(s.id);
    setRowError(null);
    const res = await fetch(`/api/admin/specialties/${s.id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) {
      load();
    } else {
      setRowError({ id: s.id, message: (await res.json().catch(() => ({}))).error ?? "Could not delete specialty." });
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900">Specialties</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage the specialties doctors can assign to their profile and patients can filter by on the map.
        </p>
      </div>

      <form onSubmit={addSpecialty} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6 flex items-end gap-3 flex-wrap">
        <div>
          <label className="input-label">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-11 h-11 rounded-lg border border-slate-200 cursor-pointer"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="input-label">New Specialty</label>
          <input
            className="input-field"
            placeholder="e.g. Urologist"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="submit" disabled={adding || !name.trim()} className="btn-primary py-2.5 px-4">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
        </button>
        {addError && (
          <span className="text-sm text-red-500 flex items-center gap-1 w-full">
            <AlertCircle className="w-3.5 h-3.5" /> {addError}
          </span>
        )}
      </form>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
        </div>
      ) : specialties.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          No specialties yet.
        </div>
      ) : (
        <div className="space-y-3">
          {specialties.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className={cn("font-semibold text-slate-900", !s.isActive && "text-slate-400 line-through")}>{s.name}</span>
                  <span className={s.isActive ? "badge badge-success" : "badge badge-gray"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(s)}
                    disabled={busyId === s.id}
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    {s.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {s.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => deleteSpecialty(s)}
                    disabled={busyId === s.id}
                    className="btn-secondary py-1.5 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
              {rowError?.id === s.id && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-2">
                  <AlertCircle className="w-3 h-3" /> {rowError.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
