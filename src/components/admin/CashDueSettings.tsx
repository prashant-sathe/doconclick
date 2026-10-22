"use client";
import { useEffect, useState } from "react";
import { Banknote, Loader2, CheckCircle2 } from "lucide-react";

// How much commission on cash visits a doctor may owe (net of their online
// earnings) before cash bookings from their side pause until they pay it
// from Earnings (src/lib/duesPayments.ts). ₹0 = no limit.
export default function CashDueSettings() {
  const [limit, setLimit] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((s) => setLimit(String(s.cashDueLimit ?? 2000))).catch(() => setLimit(""));
  }, []);

  const save = async () => {
    if (limit === null) return;
    setSaved(false); setError("");
    // Number("") is 0 — a blank field must be an error, not "no limit".
    const value = limit.trim() === "" ? NaN : Number(limit);
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
      setError("The limit must be between ₹0 and ₹10,00,000."); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashDueLimit: value }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
      const s = await res.json();
      setLimit(String(s.cashDueLimit));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Network error — the limit was not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <Banknote className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Cash commission limit</h2>
          <p className="text-xs text-slate-500">Doctors collect cash for walk-in visits and owe the platform its commission. Once they owe this much, cash walk-ins pause until they pay it from Earnings.</p>
        </div>
      </div>
      {limit === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      ) : (
        <>
          <div className="max-w-xs">
            <label className="input-label" htmlFor="cash-due-limit">Limit (₹)</label>
            <input id="cash-due-limit" type="number" min={0} className="input-field" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <p className="text-xs text-slate-400 mt-3">Set ₹0 for no limit. Online-paid walk-ins are never paused.</p>
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
