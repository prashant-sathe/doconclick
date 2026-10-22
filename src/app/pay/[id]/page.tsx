"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CreditCard, Loader2, ShieldCheck, CheckCircle, Clock, Building2, Home, Video } from "lucide-react";
import { formatDoctorName } from "@/lib/utils";
import { PayShell, Card, type GuestBill } from "./shell";

const TYPE: Record<string, { label: string; icon: React.ElementType }> = {
  CLINIC: { label: "Clinic visit", icon: Building2 },
  HOME: { label: "Home visit", icon: Home },
  VIDEO: { label: "Video consultation", icon: Video },
};

function PayContent() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get("t") ?? "";
  const [bill, setBill] = useState<GuestBill | null>(null);
  const [loadError, setLoadError] = useState<string | null>(token ? null : "This payment link is incomplete. Ask the clinic to send it again.");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/payments/guest-status?t=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.id !== id) { setLoadError(d.error ?? "This payment link isn't valid. Ask the clinic for a new one."); return; }
        setBill(d);
      })
      .catch(() => setLoadError("Network error — check your connection and try again."));
  }, [id, token]);

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
      if (!res.ok) { setPaying(false); setError(data.error ?? "Could not start payment. Please try again."); return; }
      if (data.paid) { setPaying(false); setBill((b) => (b ? { ...b, paymentStatus: "PAID" } : b)); return; }
      const { load } = await import("@cashfreepayments/cashfree-js");
      // Same hardcoded mode as /patient/payment (NEXT_PUBLIC_ vars are baked in at build time).
      const cashfree = await load({ mode: "production" });
      cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
    } catch {
      setPaying(false);
      setError("Network error — check your connection and try again.");
    }
  };

  if (loadError) return <Card><p className="text-slate-600">{loadError}</p></Card>;
  if (!bill) return <Card><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></Card>;

  const doctor = formatDoctorName(bill.doctorName);
  const { label, icon: Icon } = TYPE[bill.consultType] ?? TYPE.CLINIC;
  const when = bill.timed
    ? new Date(bill.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : `Today, ${new Date(bill.scheduledAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}`;

  if (bill.paymentStatus === "PAID") {
    return (
      <Card>
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-9 h-9 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Paid</h1>
        <p className="text-slate-500">Your {label.toLowerCase()} with {doctor} is paid for. You can close this page.</p>
      </Card>
    );
  }
  if (bill.status !== "SCHEDULED") {
    return <Card><p className="text-slate-600">This appointment is no longer active, so there&apos;s nothing to pay.</p></Card>;
  }
  if (bill.paymentMethod !== "ONLINE") {
    return <Card><p className="text-slate-600">The clinic will collect ₹{bill.amount} in cash at your visit — nothing to pay here.</p></Card>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-7 border border-slate-100">
      <div className="text-center mb-5">
        <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3 shadow-lg">
          <CreditCard className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">Pay for your visit</h1>
        <p className="text-slate-500 text-sm mt-1 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" /> Secured by Cashfree
        </p>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 mb-5 text-sm space-y-1.5">
        <div className="flex justify-between gap-3"><span className="text-slate-500">Patient</span><span className="text-slate-800 font-semibold text-right">{bill.patientName}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500">Doctor</span><span className="text-slate-800 font-semibold text-right">{doctor}{bill.specialty ? ` · ${bill.specialty}` : ""}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500 flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> {label}</span><span className="text-slate-800 text-right">{bill.clinic?.name ?? ""}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> When</span><span className="text-slate-800 text-right">{when}</span></div>
        {bill.discountAmount > 0 && (
          <div className="flex justify-between gap-3 text-emerald-600"><span>Discount</span><span>−₹{bill.discountAmount}</span></div>
        )}
        <div className="flex justify-between font-bold pt-2 mt-1 border-t border-slate-200 text-base">
          <span className="text-slate-900">Amount</span>
          <span className="text-blue-600">₹{bill.payable}</span>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</div>
      )}

      <button onClick={pay} disabled={paying} className="btn-primary w-full justify-center py-3.5 text-base">
        {paying
          ? <><Loader2 className="w-4 h-4 animate-spin" /> {bill.payable === 0 ? "Confirming…" : "Opening payment…"}</>
          : bill.payable === 0 ? "Confirm — nothing to pay" : `Pay ₹${bill.payable}`}
      </button>
      <p className="text-xs text-slate-400 text-center mt-3">UPI, cards and net banking. No sign-in needed.</p>
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
