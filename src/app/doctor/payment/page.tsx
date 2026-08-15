"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, CheckCircle, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

const REGISTRATION_FEE = 99;

export default function DoctorPayment() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [paying, setPaying] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/payment");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    fetch("/api/doctors/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAlreadyPaid(!!d?.doctorProfile?.registrationFeePaid))
      .finally(() => setChecking(false));
  }, [user]);

  const pay = async () => {
    setPaying(true);
    setError("");
    const res = await fetch("/api/doctors/registration-fee/create-order", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPaying(false);
      setError(data.error ?? "Could not start payment. Please try again.");
      return;
    }
    const { load } = await import("@cashfreepayments/cashfree-js");
    // See src/app/patient/payment/page.tsx for why this is hardcoded rather
    // than env-driven (NEXT_PUBLIC_ vars are inlined at Docker build time).
    const cashfree = await load({ mode: "production" });
    cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
  };

  if (authLoading || !user || checking) {
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
          <p className="text-slate-500 mt-2 flex items-center justify-center gap-1.5 text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> Secured by Cashfree
          </p>
        </div>

        {alreadyPaid ? (
          <div className="bg-white rounded-2xl shadow-xl p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-9 h-9 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Already Paid</h2>
            <p className="text-slate-500 mb-8">Your dashboard is unlocked.</p>
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

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {error}
              </div>
            )}

            <button onClick={pay} disabled={paying} className="btn-primary w-full justify-center py-3.5 text-base">
              {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Cashfree…</> : `Pay ₹${REGISTRATION_FEE}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
