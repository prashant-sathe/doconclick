"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift, Loader2, CheckCircle2 } from "lucide-react";
import { REFERRAL_REWARD_MAX, REFERRAL_CAP_MIN, REFERRAL_CAP_MAX } from "@/lib/referralLimits";

type Form = { patient: string; provider: string; cap: string };

// Invite & earn (src/lib/referrals.ts): what the referrer's wallet gets when
// a referred patient completes a first paid visit, or a referred doctor /
// nurse is approved. ₹0 switches that side off; both ₹0 hides the invite
// card everywhere.
export default function ReferralSettings() {
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const fill = (s: { referralRewardPatient?: number; referralRewardProvider?: number; referralMonthlyCap?: number }) =>
    setForm({ patient: String(s.referralRewardPatient ?? 0), provider: String(s.referralRewardProvider ?? 0), cap: String(s.referralMonthlyCap ?? 10) });

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then(fill).catch(() => setForm({ patient: "", provider: "", cap: "" }));
  }, []);

  const save = async () => {
    if (!form) return;
    setSaved(false); setError("");
    // Number("") is 0 — a blank field must be an error, not "switch it off".
    const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
    const patient = num(form.patient), provider = num(form.provider), cap = num(form.cap);
    if (![patient, provider].every((v) => Number.isFinite(v) && v >= 0 && v <= REFERRAL_REWARD_MAX)) {
      setError(`Rewards must be between ₹0 and ₹${REFERRAL_REWARD_MAX.toLocaleString("en-IN")}.`); return;
    }
    if (!Number.isInteger(cap) || cap < REFERRAL_CAP_MIN || cap > REFERRAL_CAP_MAX) {
      setError(`The monthly cap must be a whole number between ${REFERRAL_CAP_MIN} and ${REFERRAL_CAP_MAX}.`); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralRewardPatient: patient, referralRewardProvider: provider, referralMonthlyCap: cap }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
      fill(await res.json());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Network error — the referral settings were not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <Gift className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Invite &amp; earn</h2>
          <p className="text-xs text-slate-500">Wallet credit for the person who shared the link — once per new account.</p>
        </div>
      </div>
      {form === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      ) : (
        <>
          <div className="space-y-4">
            <div>
              <label className="input-label" htmlFor="ref-patient">Reward per referred patient (₹)</label>
              <input id="ref-patient" type="number" min={0} className="input-field" value={form.patient} onChange={(e) => setForm({ ...form, patient: e.target.value })} />
              <p className="text-xs text-slate-400 mt-1">Paid when the new patient completes their first paid visit.</p>
            </div>
            <div>
              <label className="input-label" htmlFor="ref-provider">Reward per referred doctor or nurse (₹)</label>
              <input id="ref-provider" type="number" min={0} className="input-field" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
              <p className="text-xs text-slate-400 mt-1">Paid when you approve the new doctor or nurse.</p>
            </div>
            <div className="max-w-xs">
              <label className="input-label" htmlFor="ref-cap">Most rewards per person per month</label>
              <input id="ref-cap" type="number" min={REFERRAL_CAP_MIN} max={REFERRAL_CAP_MAX} step={1} className="input-field" value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">Set a reward to ₹0 to switch that side off. With both at ₹0 the invite card is hidden and no new referrals are tracked.</p>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <button onClick={save} disabled={saving} className="btn-primary py-2.5 px-5 text-sm">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save"}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
            <Link href="/admin/reports/referrals" className="text-sm font-semibold text-blue-600 hover:underline ml-auto">View referrals →</Link>
          </div>
        </>
      )}
    </div>
  );
}
