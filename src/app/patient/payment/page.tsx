"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CreditCard, Smartphone, Building, Banknote, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS = [
  { id: "UPI",  label: "UPI",         icon: Smartphone },
  { id: "CARD", label: "Card",        icon: CreditCard },
  { id: "NET",  label: "Net Banking", icon: Building },
  { id: "CASH", label: "Cash",        icon: Banknote },
];

function PaymentContent() {
  const searchParams = useSearchParams();
  const amount = Number(searchParams.get("amount") ?? 500);
  const apptId = searchParams.get("apptId");
  const platformFee = Math.round(amount * 0.1);
  const total = amount + platformFee;

  const [method, setMethod] = useState("UPI");
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState("");

  const pay = async () => {
    if (!apptId) { setError("Missing appointment reference."); return; }
    setProcessing(true);
    setError("");
    const res = await fetch("/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: apptId, method }),
    });
    setProcessing(false);
    if (res.ok) setPaid(true);
    else setError("Payment failed. Please try again.");
  };

  if (paid) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-9 h-9 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Payment Successful!</h2>
        <p className="text-slate-500 mb-2">₹{total} paid via {method}</p>
        <p className="text-sm text-slate-400 mb-8">Your doctor will be notified. You&apos;ll receive a confirmation SMS shortly.</p>
        <Link href="/" className="btn-primary w-full justify-center py-3.5">Return to Home</Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 max-w-md w-full">
      {/* Summary */}
      <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Consultation Fee</span>
          <span className="font-semibold">₹{amount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Platform Fee (10%)</span>
          <span className="font-semibold">₹{platformFee}</span>
        </div>
        <div className="flex justify-between font-bold pt-2 border-t border-slate-200 text-base">
          <span className="text-slate-900">Total</span>
          <span className="text-blue-600">₹{total}</span>
        </div>
      </div>

      {/* Method */}
      <p className="input-label mb-3">Select Payment Method</p>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setMethod(id)}
            type="button"
            className={cn(
              "flex items-center gap-2.5 p-3.5 rounded-xl border text-sm font-semibold transition-all",
              method === id
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600 hover:border-slate-300"
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      <button onClick={pay} disabled={processing} className="btn-primary w-full justify-center py-3.5 text-base">
        {processing
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
          : `Pay ₹${total} via ${method}`}
      </button>
    </div>
  );
}

export default function PatientPayment() {
  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center p-6">
      <div className="fixed top-5 left-6">
        <Link href="/patient/book" className="btn-ghost gap-1.5 text-sm">← Back</Link>
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <CreditCard className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Complete Payment</h1>
          <p className="text-slate-500 mt-2">Secure and encrypted payment gateway.</p>
          <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            Sandbox Payment Gateway — no real money moves
          </span>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-slate-400">Loading…</div>}>
          <PaymentContent />
        </Suspense>
      </div>
    </div>
  );
}
