"use client";
import { useEffect, useState } from "react";
import { Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { RELATIONS } from "@/lib/relations";
import { useTranslations } from "next-intl";
import {
  DependentFields, EMPTY_DEPENDENT_FORM as EMPTY_FORM, dependentFormBody, dependentToForm, type Dependent,
} from "@/components/patient/DependentForm";

export type { Dependent };

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
  const t = useTranslations("booking.dependents");
  const tc = useTranslations("booking.common");
  const relationLabel = (RELATIONS as readonly string[]).includes(relation)
    ? tc(`relation.${relation as (typeof RELATIONS)[number]}`)
    : relation;
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

  const startEdit = (d: Dependent) => {
    setForm(dependentToForm(d));
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
    if (!form.name.trim()) { setError(t("errorName")); return; }
    setSaving(true);
    setError("");
    const url = editingId ? `/api/patients/me/dependents/${editingId}` : "/api/patients/me/dependents";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...dependentFormBody(form), relation }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? t("errorSave")); return; }
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

  if (loading) return <p className="text-xs text-slate-400">{t("loading")}</p>;

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
                    className="tap-44-y text-xs font-semibold text-red-600 px-2 py-2 rounded-lg hover:bg-red-50">
                    {deletingId === d.id ? "…" : t("delete")}
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(null)}
                    className="tap-44-y text-xs font-semibold text-slate-400 px-2 py-2 rounded-lg hover:bg-slate-100">
                    {tc("cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={() => startEdit(d)} aria-label={t("editName", { name: d.name })}
                    className="p-2.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(d.id)} aria-label={t("deleteName", { name: d.name })}
                    className="p-2.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => { setForm(EMPTY_FORM); setAdding(true); onSelect(null); }} className="text-xs text-blue-600 font-semibold hover:underline">
            {t("addAnother", { relation: relationLabel.toLowerCase() })}
          </button>
        </div>
      )}

      {showAddForm && (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
          <DependentFields form={form} onChange={setForm} namePlaceholder={t("namePlaceholder", { relation: relationLabel })} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            {(matching.length > 0 || editingId) && (
              <button type="button" onClick={cancelForm} className="btn-secondary py-2 px-3 text-xs flex-1">{tc("cancel")}</button>
            )}
            <button type="button" onClick={saveNew} disabled={saving} className="btn-primary py-2 px-3 text-xs flex-1">
              {saving ? tc("saving") : editingId ? t("saveChanges") : t("saveDetails", { relation: relationLabel })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
