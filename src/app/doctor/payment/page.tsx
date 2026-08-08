"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Smartphone, Building, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";

const REGISTRATION_FEE = 99;

const PAYMENT_METHODS = [
  { id: "UPI", label: "UPI", icon: Smartphone },
  { id: "CARD", label: "Card", icon: CreditCard },
  { id: "NET", label: "Net Banking", icon: Building },
];

export default function DoctorPayment() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [method, setMethod] = useState("UPI");
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/payment");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  const pay = async () => {
    setProcessing(true);
    setError("");
    const res = await fetch("/api/doctors/registration-fee/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });
    setProcessing(false);
    if (res.ok) setPaid(true);
    else setError("Payment failed. Please try again.");
  };

  if (authLoading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>;
  }

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <CreditCard className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Registration Fee</h1>
          <p className="text-slate-500 mt-2">A one-time ₹{REGISTRATION_FEE} fee activates your doctor dashboard.</p>
          <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            Sandbox Payment Gateway — no real money moves
          </span>
        </div>

        {paid ? (
          <div className="bg-white rounded-2xl shadow-xl p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-9 h-9 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Payment Successful!</h2>
            <p className="text-slate-500 mb-8">Your dashboard is now unlocked. Let&apos;s complete your consultation profile.</p>
            <button onClick={() => router.push("/doctor/dashboard")} className="btn-primary w-full justify-center py-3.5 text-base">
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
            <div className="bg-slate-50 rounded-xl p-4 mb-6 flex justify-between items-center">
              <span className="text-slate-500 text-sm">Registration Fee</span>
              <span className="font-extrabold text-blue-600 text-xl">₹{REGISTRATION_FEE}</span>
            </div>

            <p className="input-label mb-3">Select Payment Method</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setMethod(id)}
                  type="button"
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3.5 rounded-xl border text-xs font-semibold transition-all",
                    method === id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
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
              {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : `Pay ₹${REGISTRATION_FEE} via ${method}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
