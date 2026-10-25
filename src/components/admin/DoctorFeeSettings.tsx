"use client";
import { useEffect, useState } from "react";
import { Stethoscope, Loader2, CheckCircle2 } from "lucide-react";
import { DOCTOR_REGISTRATION_FEE_MAX, resolveDoctorRegistrationPricing } from "@/lib/doctorFeePricing";

// Number("") is 0 — a blank field must never become "₹0 = free".
const parse = (v: string) => (v.trim() === "" ? null : Number(v));

// The doctors' one-time registration fee: an original price and an optional
// discounted one that is charged instead (original struck through). Empty
// discount = the original is charged; an explicit ₹0 discount = free. Read by
// checkout, coupons, the approve gate and the doctor's own pages; an order
// already open keeps the amount it was created for.
export default function DoctorFeeSettings() {
  const [original, setOriginal] = useState<string | null>(null);
  const [discounted, setDiscounted] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = (s: { doctorRegistrationOriginalFee?: number | null; doctorRegistrationFee?: number | null }) => {
    setOriginal(String(s.doctorRegistrationOriginalFee ?? 499));
    setDiscounted(typeof s.doctorRegistrationFee === "number" ? String(s.doctorRegistrationFee) : "");
  };

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then(load).catch(() => setOriginal(""));
  }, []);

  const originalValue = original === null ? null : parse(original);
  const discountedValue = parse(discounted);
  const validationError = (() => {
    if (originalValue === null || !Number.isFinite(originalValue) || Math.round(originalValue) < 1 || originalValue > DOCTOR_REGISTRATION_FEE_MAX) {
      return "The original fee must be between ₹1 and ₹1,00,000.";
    }
    if (discountedValue !== null && (!Number.isFinite(discountedValue) || discountedValue < 0)) {
      return "The discounted fee must be ₹0 or more — or leave it empty for no discount.";
    }
    if (discountedValue !== null && Math.round(discountedValue) >= Math.round(originalValue)) {
      return "The discounted fee must be less than the original fee — or leave it empty for no discount.";
    }
    return "";
  })();
  const preview = validationError
    ? null
    : resolveDoctorRegistrationPricing(Math.round(originalValue!), discountedValue === null ? null : Math.round(discountedValue));

  const save = async () => {
    if (original === null) return;
    setSaved(false); setError("");
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorRegistrationOriginalFee: originalValue, doctorRegistrationFee: discountedValue }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
      load(await res.json());
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
          <p className="text-xs text-slate-500">One-time, paid before a doctor&apos;s dashboard unlocks. Set a discounted price of ₹0 to make it free.</p>
        </div>
      </div>
      {original === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
            <div>
              <label className="input-label" htmlFor="doctor-reg-fee-original">Original price (₹)</label>
              <input id="doctor-reg-fee-original" type="number" min={1} className="input-field" value={original} onChange={(e) => setOriginal(e.target.value)} />
            </div>
            <div>
              <label className="input-label" htmlFor="doctor-reg-fee">Discounted price (₹, optional)</label>
              <input id="doctor-reg-fee" type="number" min={0} className="input-field" placeholder="No discount" value={discounted} onChange={(e) => setDiscounted(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 max-w-lg">
            <p className="text-xs text-slate-500 mb-1">Doctors will see</p>
            {preview ? (
              <p className="flex items-baseline gap-2">
                {preview.hasDiscount && <span className="text-slate-400 text-sm line-through">₹{preview.original}</span>}
                <span className="font-extrabold text-lg text-blue-600">{preview.payable === 0 ? "Free" : `₹${preview.payable}`}</span>
                <span className="text-xs text-slate-500">{preview.payable === 0 ? "— activated without a payment step" : "is charged"}</span>
              </p>
            ) : (
              <p className="text-sm text-red-600">{validationError}</p>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-3">Coupons apply on the charged price. Applies to new checkouts; a doctor already on the payment screen pays what they were shown.</p>
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
