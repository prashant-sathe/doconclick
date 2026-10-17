"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartPulse, Loader2, CheckCircle2, ChevronRight } from "lucide-react";

// Admin-owned nurse economics: commission on every nurse visit, and the
// one-time registration + monthly subscription fees (₹0 = free).
export default function NurseSettings() {
  const [form, setForm] = useState<{ commission: string; regFee: string; subFee: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((s) => setForm({
      commission: String(s.nurseCommissionPercent ?? 10),
      regFee: String(s.nurseRegistrationFee ?? 0),
      subFee: String(s.nurseSubscriptionFee ?? 0),
    }));
  }, []);

  const save = async () => {
    if (!form) return;
    setSaved(false); setError("");
    // Number("") is 0 — a blank field must be an error, not a free/0% setting.
    const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
    const commission = num(form.commission);
    const regFee = num(form.regFee);
    const subFee = num(form.subFee);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      setError("Commission must be a number between 0 and 100."); return;
    }
    if (![regFee, subFee].every((f) => Number.isFinite(f) && f >= 0 && f <= 100000)) {
      setError("Fees must be between ₹0 and ₹1,00,000."); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nurseCommissionPercent: commission,
          nurseRegistrationFee: regFee,
          nurseSubscriptionFee: subFee,
        }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Network error — settings were not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
          <HeartPulse className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Nurse fees &amp; commission</h2>
          <p className="text-xs text-slate-500">Set a fee to ₹0 to make it free.</p>
        </div>
      </div>
      {!form ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="input-label">Commission per visit (%)</label>
              <input type="number" min={0} max={100} className="input-field" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Registration fee (₹, one-time)</label>
              <input type="number" min={0} className="input-field" value={form.regFee} onChange={(e) => setForm({ ...form, regFee: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Subscription (₹ / month)</label>
              <input type="number" min={0} className="input-field" value={form.subFee} onChange={(e) => setForm({ ...form, subFee: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Commission applies to visits booked from now on. With a subscription above ₹0, nurses without an active month are hidden from patients.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={save} disabled={saving} className="btn-primary py-2.5 px-5 text-sm">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save"}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
          <Link href="/admin/nurse-services" className="mt-5 flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Manage nurse services &amp; suggested prices <ChevronRight className="w-4 h-4 text-slate-300" />
          </Link>
        </>
      )}
    </div>
  );
}
