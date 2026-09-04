"use client";
import { useState } from "react";
import { Pencil, Check, X, Loader2, AlertCircle } from "lucide-react";

// Inline name editor for profile headers — click the pencil, edit, save.
// Saving re-signs the auth cookie server-side, so callers must pass a
// `refresh` (from useAuth()) to pick up the new name across the app.
export default function EditableName({
  name,
  displayName,
  onSaved,
}: {
  name: string;
  displayName?: string;
  onSaved: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEdit = () => {
    setValue(name);
    setError("");
    setEditing(true);
  };

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/auth/name", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      onSaved(trimmed);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not update name.");
    }
  };

  if (editing) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            className="input-field py-1.5 text-sm font-bold min-w-0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            disabled={saving}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 flex-shrink-0"
            title="Save"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 flex-shrink-0"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="group flex items-center gap-1.5 min-w-0 text-left"
      title="Edit name"
    >
      <h1 className="text-lg font-extrabold text-slate-900 truncate">{displayName ?? name}</h1>
      <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 flex-shrink-0" />
    </button>
  );
}
