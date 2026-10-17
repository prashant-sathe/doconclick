"use client";
import { useEffect, useState } from "react";
import { ClipboardList, Plus, Trash2, Loader2, Pencil, Eye, EyeOff, FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  suggestedPrice: number;
  requiresPrescription: boolean;
  isActive: boolean;
  _count: { offerings: number; appointments: number };
}

type FormState = { name: string; description: string; durationMinutes: string; suggestedPrice: string; requiresPrescription: boolean };
const EMPTY: FormState = { name: "", description: "", durationMinutes: "30", suggestedPrice: "", requiresPrescription: false };

function ServiceForm({ value, onChange }: { value: FormState; onChange: (v: FormState) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <label className="input-label">Service name</label>
        <input className="input-field" placeholder="e.g. Injection (IM / IV)" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="input-label">Description (shown to patients)</label>
        <input className="input-field" value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />
      </div>
      <div>
        <label className="input-label">Typical duration (minutes)</label>
        <input type="number" min={5} className="input-field" value={value.durationMinutes} onChange={(e) => onChange({ ...value, durationMinutes: e.target.value })} />
      </div>
      <div>
        <label className="input-label">Suggested price (₹)</label>
        <input type="number" min={0} className="input-field" value={value.suggestedPrice} onChange={(e) => onChange({ ...value, suggestedPrice: e.target.value })} />
      </div>
      <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="w-4 h-4 accent-rose-500" checked={value.requiresPrescription} onChange={(e) => onChange({ ...value, requiresPrescription: e.target.checked })} />
        Needs a doctor&apos;s prescription (injections, IV, catheter…)
      </label>
    </div>
  );
}

const toBody = (f: FormState) => ({
  name: f.name,
  description: f.description,
  durationMinutes: Number(f.durationMinutes),
  suggestedPrice: Number(f.suggestedPrice || 0),
  requiresPrescription: f.requiresPrescription,
});

export default function AdminNurseServices() {
  const [rows, setRows] = useState<ServiceRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ServiceRow | null>(null);

  const load = () => fetch("/api/admin/nurse-services").then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  const add = async () => {
    setBusyId("new"); setError("");
    const res = await fetch("/api/admin/nurse-services", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toBody(form)),
    });
    setBusyId(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not add."); return; }
    setForm(EMPTY); setAdding(false); load();
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id); setError("");
    const res = await fetch(`/api/admin/nurse-services/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return false; }
    load();
    return true;
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id); setError("");
    const res = await fetch(`/api/admin/nurse-services/${deleteTarget.id}`, { method: "DELETE" });
    setBusyId(null);
    setDeleteTarget(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not delete."); return; }
    load();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2"><ClipboardList className="w-6 h-6 text-rose-500" />Nurse Services</h1>
          <p className="text-slate-500 text-sm mt-1">The services patients can book a nurse for. Nurses pick from this list and set their own price.</p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setForm(EMPTY); }} className="btn-primary py-2.5 px-4 text-sm"><Plus className="w-4 h-4" /> Add service</button>
        )}
      </div>

      {error && <div className="max-w-3xl mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

      {adding && (
        <div className="max-w-3xl bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
          <h2 className="font-bold text-slate-800 mb-3">New service</h2>
          <ServiceForm value={form} onChange={setForm} />
          <div className="flex gap-2 mt-4">
            <button onClick={() => setAdding(false)} className="btn-secondary py-2 px-4 text-sm">Cancel</button>
            <button onClick={add} disabled={busyId === "new"} className="btn-primary py-2 px-4 text-sm">
              {busyId === "new" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add service"}
            </button>
          </div>
        </div>
      )}

      {rows === null ? (
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      ) : (
        <div className="max-w-3xl space-y-3">
          {rows.map((s) => (
            <div key={s.id} className={cn("bg-white rounded-2xl border shadow-sm p-5", s.isActive ? "border-slate-100" : "border-slate-200 opacity-70")}>
              {editId === s.id ? (
                <>
                  <ServiceForm value={editForm} onChange={setEditForm} />
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => setEditId(null)} className="btn-secondary py-2 px-4 text-sm">Cancel</button>
                    <button
                      onClick={async () => { if (await patch(s.id, toBody(editForm))) setEditId(null); }}
                      disabled={busyId === s.id}
                      className="btn-primary py-2 px-4 text-sm"
                    >
                      {busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                      {s.name}
                      {!s.isActive && <span className="badge badge-gray text-[10px]">Hidden</span>}
                      {s.requiresPrescription && <span className="badge badge-warning text-[10px] inline-flex items-center gap-1"><FileText className="w-3 h-3" />Prescription</span>}
                    </p>
                    {s.description && <p className="text-sm text-slate-500 mt-0.5">{s.description}</p>}
                    <p className="text-xs text-slate-400 mt-1">
                      ~{s.durationMinutes} min · suggested ₹{s.suggestedPrice} · {s._count.offerings} nurse{s._count.offerings === 1 ? "" : "s"} · {s._count.appointments} booking{s._count.appointments === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      title="Edit"
                      onClick={() => {
                        setEditId(s.id);
                        setEditForm({ name: s.name, description: s.description ?? "", durationMinutes: String(s.durationMinutes), suggestedPrice: String(s.suggestedPrice), requiresPrescription: s.requiresPrescription });
                      }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50"
                    ><Pencil className="w-4 h-4" /></button>
                    <button
                      title={s.isActive ? "Hide from patients & nurses" : "Show again"}
                      disabled={busyId === s.id}
                      onClick={() => patch(s.id, { isActive: !s.isActive })}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50"
                    >{s.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                    <button
                      title="Delete"
                      disabled={s._count.appointments > 0}
                      onClick={() => setDeleteTarget(s)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                    ><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          icon={Trash2}
          tone="danger"
          title={`Delete “${deleteTarget.name}”?`}
          message={deleteTarget._count.offerings > 0
            ? `${deleteTarget._count.offerings} nurse(s) offer this — it will be removed from their profiles.`
            : "This can't be undone."}
          confirmLabel="Delete"
          busy={busyId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
