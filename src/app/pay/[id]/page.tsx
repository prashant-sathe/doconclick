"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CreditCard, Loader2, ShieldCheck, CheckCircle, Clock, Building2, Home, Video } from "lucide-react";
import { formatDoctorName } from "@/lib/utils";
import { PayShell, Card, type GuestBill } from "./shell";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

const TYPE: Record<string, { key: "CLINIC" | "HOME" | "VIDEO"; icon: React.ElementType }> = {
  CLINIC: { key: "CLINIC", icon: Building2 },
  HOME: { key: "HOME", icon: Home },
  VIDEO: { key: "VIDEO", icon: Video },
};

function PayContent() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get("t") ?? "";
  const t = useTranslations("booking.payLink");
  const tc = useTranslations("booking.common");
  const locale = formattingLocale(useLocale());
  const [bill, setBill] = useState<GuestBill | null>(null);
  const [loadError, setLoadError] = useState<string | null>(token ? null : t("incomplete"));
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/payments/guest-status?t=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.id !== id) { setLoadError(d.error ?? t("invalid")); return; }
        setBill(d);
      })
      .catch(() => setLoadError(tc("networkError")));
    }, [id, token, t, tc]);

  const pay = async () => {
    setPaying(true);
    setError("");
    try {
      const res = await fetch("/api/payments/guest-create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPaying(false); setError(data.error ?? tc("startPaymentFailed")); return; }
      if (data.paid) { setPaying(false); setBill((b) => (b ? { ...b, paymentStatus: "PAID" } : b)); return; }
      const { load } = await import("@cashfreepayments/cashfree-js");
      // Same hardcoded mode as /patient/payment (NEXT_PUBLIC_ vars are baked in at build time).
      const cashfree = await load({ mode: "production" });
      cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
    } catch {
      setPaying(false);
      setError(tc("networkError"));
    }
  };

  if (loadError) return <Card><p className="text-slate-600">{loadError}</p></Card>;
  if (!bill) return <Card><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></Card>;

  const doctor = formatDoctorName(bill.doctorName);
  const { key: typeKey, icon: Icon } = TYPE[bill.consultType] ?? TYPE.CLINIC;
  const label = tc(`consultType.${typeKey}`);
  const when = bill.timed
    ? new Date(bill.scheduledAt).toLocaleString(locale, { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : t("todayDate", { date: new Date(bill.scheduledAt).toLocaleDateString(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) });

  if (bill.paymentStatus === "PAID") {
    return (
      <Card>
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-9 h-9 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-1">{t("paidTitle")}</h1>
        <p className="text-slate-500">{t("paidBody", { type: typeKey, doctor })}</p>
      </Card>
    );
  }
  if (bill.status !== "SCHEDULED") {
    return <Card><p className="text-slate-600">{tc("noLongerActive")}</p></Card>;
  }
  if (bill.paymentMethod !== "ONLINE") {
    return <Card><p className="text-slate-600">{t("cash", { amount: bill.amount })}</p></Card>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-7 border border-slate-100">
      <div className="text-center mb-5">
        <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3 shadow-lg">
          <CreditCard className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
        <p className="text-slate-500 text-sm mt-1 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" /> {tc("securedByCashfree")}
        </p>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 mb-5 text-sm space-y-1.5">
        <div className="flex justify-between gap-3"><span className="text-slate-500">{t("patient")}</span><span className="text-slate-800 font-semibold text-right">{bill.patientName}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500">{tc("doctor")}</span><span className="text-slate-800 font-semibold text-right">{doctor}{bill.specialty ? ` · ${bill.specialty}` : ""}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500 flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> {label}</span><span className="text-slate-800 text-right">{bill.clinic?.name ?? ""}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {tc("when")}</span><span className="text-slate-800 text-right">{when}</span></div>
        {bill.discountAmount > 0 && (
          <div className="flex justify-between gap-3 text-emerald-600"><span>{t("discount")}</span><span>−₹{bill.discountAmount}</span></div>
        )}
        <div className="flex justify-between font-bold pt-2 mt-1 border-t border-slate-200 text-base">
          <span className="text-slate-900">{tc("amount")}</span>
          <span className="text-blue-600">₹{bill.payable}</span>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</div>
      )}

      <button onClick={pay} disabled={paying} className="btn-primary w-full justify-center py-3.5 text-base">
        {paying
          ? <><Loader2 className="w-4 h-4 animate-spin" /> {bill.payable === 0 ? tc("confirming") : t("opening")}</>
          : bill.payable === 0 ? t("confirmNothing") : t("pay", { amount: bill.payable })}
      </button>
      <p className="text-xs text-slate-400 text-center mt-3">{t("methods")}</p>
    </div>
  );
}

export default function GuestPayPage() {
  return (
    <PayShell>
      <Suspense fallback={<Card><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></Card>}>
        <PayContent />
      </Suspense>
    </PayShell>
  );
}
