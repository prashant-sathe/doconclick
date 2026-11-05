"use client";
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Plus, Trash2, Loader2, Pencil, Eye, EyeOff, AlertCircle, Search, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

interface LabTestRow {
  id: string;
  name: string;
  b2bPrice: number;
  commissionPercent: number;
  finalPrice: number;
  isActive: boolean;
  bookings: number;
}

type FormState = { name: string; b2bPrice: string; commissionPercent: string };
const DEFAULT_COMMISSION = "50";
const EMPTY: FormState = { name: "", b2bPrice: "", commissionPercent: DEFAULT_COMMISSION };

// Same rule as labTestPrice() in src/lib/labTests.ts (the server is the source of truth).
function previewPrice(f: FormState): number | null {
  const b2b = Number(f.b2bPrice);
  const pct = Number(f.commissionPercent);
  if (!f.b2bPrice || !Number.isFinite(b2b) || b2b <= 0 || f.commissionPercent === "" || !Number.isFinite(pct) || pct < 0) return null;
  return Math.round(b2b * (1 + pct / 100));
}

const toBody = (f: FormState) => ({ name: f.name, b2bPrice: Number(f.b2bPrice), commissionPercent: Number(f.commissionPercent) });
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AdminLabTests() {
  const [rows, setRows] = useState<LabTestRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<LabTestRow | null>(null);

  const load = () =>
    fetch("/api/admin/lab-tests")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load lab tests.");
        return r.json();
      })
      .then((data: LabTestRow[]) => { setRows(data); setLoadError(""); })
      .catch((e: Error) => setLoadError(e.message));
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const add = async () => {
    setBusyId("new"); setError("");
    const res = await fetch("/api/admin/lab-tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toBody(form)) });
    setBusyId(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not add."); return; }
    setForm(EMPTY); setAdding(false); load();
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id); setError("");
    const res = await fetch(`/api/admin/lab-tests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusyId(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return false; }
    const updated: LabTestRow = await res.json();
    setRows((cur) => cur?.map((r) => (r.id === id ? updated : r)) ?? cur);
    return true;
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id); setError("");
    const res = await fetch(`/api/admin/lab-tests/${deleteTarget.id}`, { method: "DELETE" });
    setBusyId(null);
    setDeleteTarget(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not delete."); return; }
    load();
  };

  const addPreview = previewPrice(form);
  const editPreview = previewPrice(editForm);
  const activeCount = rows?.filter((r) => r.isActive).length ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2"><FlaskConical className="w-6 h-6 text-teal-600" />Lab Tests</h1>
          <p className="text-slate-500 text-sm mt-1">
            Doctors pick these when they prescribe tests; patients book them at the final price (B2B price + commission).
            {rows && <> · {activeCount} active of {rows.length}</>}
          </p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setForm(EMPTY); }} className="btn-primary py-2.5 px-4 text-sm"><Plus className="w-4 h-4" /> Add test</button>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

      {adding && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5 max-w-4xl">
          <h2 className="font-bold text-slate-800 mb-3">New lab test</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="input-label">Test name</label>
              <input className="input-field" placeholder="e.g. Lipid Profile" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="input-label">B2B price (₹)</label>
              <input type="number" min={0} className="input-field" value={form.b2bPrice} onChange={(e) => setForm({ ...form, b2bPrice: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Commission (%)</label>
              <input type="number" min={0} className="input-field" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} />
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-3">Final price for patients: <span className="font-bold text-slate-900">{addPreview === null ? "—" : rupees(addPreview)}</span></p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setAdding(false)} className="btn-secondary py-2 px-4 text-sm">Cancel</button>
            <button onClick={add} disabled={busyId === "new" || !form.name.trim() || addPreview === null} className="btn-primary py-2 px-4 text-sm">
              {busyId === "new" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add test"}
            </button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm mb-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input-field pl-9" placeholder="Search tests" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loadError ? (
        <div className="text-sm text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{loadError} <button onClick={load} className="underline font-semibold">Retry</button></div>
      ) : rows === null ? (
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-bold px-4 py-3 w-12">#</th>
                <th className="text-left font-bold px-4 py-3">Test name</th>
                <th className="text-right font-bold px-4 py-3 w-32">B2B price</th>
                <th className="text-right font-bold px-4 py-3 w-32">Commission</th>
                <th className="text-right font-bold px-4 py-3 w-32">Final price</th>
                <th className="text-right font-bold px-4 py-3 w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((t, i) => editId === t.id ? (
                <tr key={t.id} className="bg-teal-50/40">
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2"><input className="input-field text-sm py-1.5" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td className="px-4 py-2"><input type="number" min={0} className="input-field text-sm py-1.5 text-right" value={editForm.b2bPrice} onChange={(e) => setEditForm({ ...editForm, b2bPrice: e.target.value })} /></td>
                  <td className="px-4 py-2"><input type="number" min={0} className="input-field text-sm py-1.5 text-right" value={editForm.commissionPercent} onChange={(e) => setEditForm({ ...editForm, commissionPercent: e.target.value })} /></td>
                  <td className="px-4 py-2 text-right font-bold text-slate-900">{editPreview === null ? "—" : rupees(editPreview)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title="Save"
                        disabled={busyId === t.id || !editForm.name.trim() || editPreview === null}
                        onClick={async () => { if (await patch(t.id, toBody(editForm))) setEditId(null); }}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-teal-600 hover:bg-teal-50 disabled:opacity-40"
                      >{busyId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}</button>
                      <button title="Cancel" onClick={() => setEditId(null)} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50"><X className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={t.id} className={cn("hover:bg-slate-50/60", !t.isActive && "opacity-60")}>
                  <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">
                    {t.name}
                    {!t.isActive && <span className="badge badge-gray text-[10px] ml-2">Hidden</span>}
                    {t.bookings > 0 && <span className="text-xs font-normal text-slate-400 ml-2">{t.bookings} booked</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{rupees(t.b2bPrice)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{t.commissionPercent}%</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-900">{rupees(t.finalPrice)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title="Edit"
                        onClick={() => { setEditId(t.id); setEditForm({ name: t.name, b2bPrice: String(t.b2bPrice), commissionPercent: String(t.commissionPercent) }); }}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50"
                      ><Pencil className="w-4 h-4" /></button>
                      <button
                        title={t.isActive ? "Hide from doctors & patients" : "Show again"}
                        disabled={busyId === t.id}
                        onClick={() => patch(t.id, { isActive: !t.isActive })}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50"
                      >{t.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                      <button title="Delete" onClick={() => setDeleteTarget(t)} className="w-9 h-9 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">{query ? "No test matches your search." : "No lab tests yet."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          icon={Trash2}
          tone="danger"
          title={`Delete “${deleteTarget.name}”?`}
          message={deleteTarget.bookings > 0
            ? `It was booked ${deleteTarget.bookings} time(s) — those bookings keep their price and name. To only stop new bookings, hide it instead.`
            : "Doctors won't see it any more and patients can't book it. This can't be undone."}
          confirmLabel="Delete"
          busy={busyId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
