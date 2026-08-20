"use client";
import { useEffect, useState } from "react";
import { Tag, Plus, Trash2, Loader2, EyeOff, Eye, AlertCircle, Pencil, X, Check, Search } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<SpecialtyRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#2563eb");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SpecialtyRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = () => {
    fetch("/api/admin/specialties")
      .then((r) => r.json())
      .then((d) => { setSpecialties(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const filtered = specialties.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

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
    await fetch(`/api/admin/specialties/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    setBusyId(null);
    load();
  };

  const openEdit = (s: SpecialtyRow) => {
    setEditTarget(s);
    setEditName(s.name);
    setEditColor(s.color);
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError("Name is required");
      return;
    }
    setSaving(true);
    setEditError("");
    const res = await fetch(`/api/admin/specialties/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, color: editColor }),
    });
    setSaving(false);
    if (res.ok) {
      setEditTarget(null);
      load();
    } else {
      setEditError((await res.json().catch(() => ({}))).error ?? "Could not update specialty.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/admin/specialties/${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      setDeleteTarget(null);
      load();
    } else {
      setDeleteError((await res.json().catch(() => ({}))).error ?? "Could not delete specialty.");
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

      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search specialties…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          {search ? "No specialties match your search." : "No specialties yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
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
                    onClick={() => openEdit(s)}
                    disabled={busyId === s.id}
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => toggleActive(s)}
                    disabled={busyId === s.id}
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    {s.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {s.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => { setDeleteTarget(s); setDeleteError(""); }}
                    disabled={busyId === s.id}
                    className="btn-secondary py-1.5 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-4">
              <Pencil className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-800">Edit Specialty</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-end gap-3">
                <div>
                  <label className="input-label">Color</label>
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-11 h-11 rounded-lg border border-slate-200 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <label className="input-label">Name</label>
                  <input
                    className="input-field"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
              </div>
              {editError && (
                <span className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {editError}
                </span>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditTarget(null)} className="btn-secondary flex-1">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || !editName.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <Trash2 className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-800">Delete this specialty?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              This will permanently remove <span className="font-semibold text-slate-700">{deleteTarget.name}</span>. This action cannot be undone.
            </p>
            {deleteError && (
              <p className="text-xs text-red-500 flex items-center gap-1 mb-3">
                <AlertCircle className="w-3 h-3" /> {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Delete Specialty"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
