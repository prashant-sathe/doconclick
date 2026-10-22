"use client";
import { useEffect, useState } from "react";
import { Stethoscope, Loader2, CheckCircle2 } from "lucide-react";

// The doctors' one-time registration fee (₹0 = free: they activate without
// paying). Read by checkout, coupons, the approve gate and the doctor's own
// pages; an order already open keeps the amount it was created for.
export default function DoctorFeeSettings() {
  const [fee, setFee] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((s) => setFee(String(s.doctorRegistrationFee ?? 99))).catch(() => setFee(""));
  }, []);

  const save = async () => {
    if (fee === null) return;
    setSaved(false); setError("");
    // Number("") is 0 — a blank field must be an error, not "free".
    const value = fee.trim() === "" ? NaN : Number(fee);
    if (!Number.isFinite(value) || value < 0 || value > 100000) {
      setError("The fee must be between ₹0 and ₹1,00,000."); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorRegistrationFee: value }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
      const s = await res.json();
      setFee(String(s.doctorRegistrationFee));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Network error — the fee was not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
          <Stethoscope className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Doctor registration fee</h2>
          <p className="text-xs text-slate-500">One-time, paid before a doctor&apos;s dashboard unlocks. Set ₹0 to make it free.</p>
        </div>
      </div>
      {fee === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      ) : (
        <>
          <div className="max-w-xs">
            <label className="input-label" htmlFor="doctor-reg-fee">Registration fee (₹)</label>
            <input id="doctor-reg-fee" type="number" min={0} className="input-field" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <p className="text-xs text-slate-400 mt-3">Applies to new checkouts; a doctor already on the payment screen pays what they were shown.</p>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={save} disabled={saving} className="btn-primary py-2.5 px-5 text-sm">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save"}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
