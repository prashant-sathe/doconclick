"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, CreditCard, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

type DuesInfo = {
  dues: { cashFeeOwed: number; onlinePayoutOwed: number; netAmount: number };
  owed: number;
  limit: number;
  cashBlocked: boolean;
  inReview: number;
};

// "You owe ₹X platform fee → Pay now" (src/lib/duesPayments.ts), plus the
// confirmation after coming back from Cashfree (?duesOrder=). Shown on
// Earnings and on Subscribe — a doctor whose plan has lapsed lands on the
// latter and can still pay what they owe. Renders nothing when nothing's owed.
export default function DuesPayCard({ returnTo, onSettled, className = "mb-6" }: { returnTo: "earnings" | "subscribe"; onSettled?: () => void; className?: string }) {
  const t = useTranslations("doctor.dues");
  const tc = useTranslations("doctor.common");
  const [info, setInfo] = useState<DuesInfo | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [returned, setReturned] = useState<"checking" | "settled" | "review" | "pending" | null>(null);
  // Read once: the URL is cleaned below, and a remounted effect (StrictMode)
  // must still see which order to confirm.
  const [returnOrderId] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("duesOrder")));

  const load = useCallback(async () => {
    const res = await fetch("/api/doctor/dues", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setInfo(await res.json());
  }, []);

  useEffect(() => {
    // Loading on mount: it only sets state after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Back from Cashfree: the webhook usually beats us, else verify asks the gateway.
  useEffect(() => {
    const orderId = returnOrderId;
    if (!orderId) return;
    window.history.replaceState(null, "", window.location.pathname);
    let cancelled = false;
    // Starting the post-checkout confirmation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReturned("checking");
    (async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        const res = await fetch("/api/doctor/dues/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        }).catch(() => null);
        const d = res?.ok ? await res.json() : null;
        if (cancelled) return;
        if (d?.status === "SETTLED" || d?.status === "REVIEW") {
          setReturned(d.status === "SETTLED" ? "settled" : "review");
          void load();
          onSettled?.();
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!cancelled) setReturned("pending");
    })();
    return () => { cancelled = true; };
    // Once per page load — onSettled may be a fresh function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, returnOrderId]);

  const pay = async () => {
    setPaying(true);
    setError("");
    try {
      const res = await fetch("/api/doctor/dues/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPaying(false); setError(data.error ?? t("startFailed")); void load(); return; }
      const { load: loadCashfree } = await import("@cashfreepayments/cashfree-js");
      // Same hardcoded mode as the other checkouts (NEXT_PUBLIC_ vars are baked in at build time).
      const cashfree = await loadCashfree({ mode: "production" });
      cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
    } catch {
      setPaying(false);
      setError(tc("networkError"));
    }
  };

  const owes = !!info && info.owed > 0;
  if (!returned && !owes) return null;

  return (
    <div className={className}>
      {returned && (
        <div className={`flex items-center gap-3 rounded-2xl p-4 border ${owes ? "mb-3" : ""} ${returned === "settled" ? "bg-emerald-50 border-emerald-100 text-emerald-800" : returned === "checking" ? "bg-slate-50 border-slate-100 text-slate-700" : "bg-amber-50 border-amber-100 text-amber-800"}`}>
          {returned === "checking" ? <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" /> : returned === "settled" ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <Clock className="w-5 h-5 flex-shrink-0" />}
          <p className="text-sm text-left">
            {returned === "checking" && t("checking")}
            {returned === "settled" && t("settled")}
            {returned === "review" && t("review")}
            {returned === "pending" && t("pending")}
          </p>
        </div>
      )}

      {owes && info && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-left">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-red-700">
                {info.dues.onlinePayoutOwed > 0
                  ? t.rich("dueLessOnline", {
                      owed: info.owed.toLocaleString("en-IN"),
                      cash: info.dues.cashFeeOwed.toLocaleString("en-IN"),
                      online: info.dues.onlinePayoutOwed.toLocaleString("en-IN"),
                      b: (c) => <span className="font-bold">{c}</span>,
                    })
                  : t.rich("due", { owed: info.owed.toLocaleString("en-IN"), b: (c) => <span className="font-bold">{c}</span> })}
              </p>
              {info.cashBlocked ? (
                <p className="text-xs text-red-700 font-semibold mt-1">{t("cashBlocked")}</p>
              ) : info.limit > 0 ? (
                <p className="text-xs text-red-600 mt-1">{t("limit", { limit: info.limit.toLocaleString("en-IN") })}</p>
              ) : null}
              {info.inReview > 0 && (
                <p className="text-xs text-amber-700 mt-1">{t("inReview")}</p>
              )}
              <button onClick={pay} disabled={paying || returned === "checking" || info.inReview > 0} className="btn-primary mt-3 py-2.5 px-4 text-sm disabled:opacity-60">
                {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("opening")}</> : <><CreditCard className="w-4 h-4" /> {t("payNow", { owed: info.owed.toLocaleString("en-IN") })}</>}
              </button>
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
