"use client";
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

const QUICK_AMOUNTS = [100, 500, 1000, 2000];

export default function WalletTopUpModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("patientAccount.topUp");
  const [amount, setAmount] = useState<number | "">(500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const topUp = async () => {
    if (!amount || amount <= 0) { setError(t("invalid")); return; }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/wallet/topup/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitting(false);
      setError(data.error ?? t("couldNotStart"));
      return;
    }
    const { load } = await import("@cashfreepayments/cashfree-js");
    // Same NEXT_PUBLIC_*-baked-at-Docker-build-time constraint as
    // /patient/payment — sandbox mode isn't wired up yet.
    const cashfree = await load({ mode: "production" });
    cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-slate-900">{t("title")}</h2>
          <button aria-label={t("close")} onClick={onClose} className="tap-44 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                amount === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              }`}
            >
              ₹{v}
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t("amount")}</label>
        <input
          type="number"
          min={100}
          max={25000}
          value={amount}
          onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
          className="input-field w-full mb-4"
          placeholder={t("placeholder")}
        />

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
            {error}
          </div>
        )}

        <button onClick={topUp} disabled={submitting} className="btn-primary w-full justify-center py-3">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("redirecting")}</> : t("proceed")}
        </button>
      </div>
    </div>
  );
}
