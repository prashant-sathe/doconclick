"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, CheckCircle, Loader2, ShieldCheck, Gift, TicketPercent, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { DOCTOR_SUBSCRIPTION_FEE } from "@/lib/cashfree";

const REGISTRATION_FEE = 99;
const REGISTRATION_FEE_ORIGINAL = 499;
const FREE_TRIAL_MONTHS = 6;
const TRIAL_VALUE = DOCTOR_SUBSCRIPTION_FEE * FREE_TRIAL_MONTHS;

export default function DoctorPayment() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [paying, setPaying] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountAmount: number; netAmount: number } | null>(null);

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

  const payable = coupon ? coupon.netAmount : REGISTRATION_FEE;

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setApplyingCoupon(true);
    setCouponError("");
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponInput.trim(), context: "DOCTOR_REGISTRATION" }),
    });
    const data = await res.json().catch(() => ({}));
    setApplyingCoupon(false);
    if (!res.ok) { setCouponError(data.error ?? "Could not apply that coupon."); return; }
    setCoupon({ code: data.code, discountAmount: data.discountAmount, netAmount: data.netAmount });
    setCouponInput("");
  };

  const pay = async () => {
    setPaying(true);
    setError("");
    const res = await fetch("/api/doctors/registration-fee/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coupon ? { code: coupon.code } : {}),
    });
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
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
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
            <div className="bg-slate-50 rounded-xl p-4 mb-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Registration Fee</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-slate-400 text-sm line-through">₹{REGISTRATION_FEE_ORIGINAL}</span>
                  <span className={`font-extrabold text-xl ${coupon ? "text-slate-400 line-through" : "text-blue-600"}`}>₹{REGISTRATION_FEE}</span>
                </span>
              </div>
              {coupon && (
                <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-200">
                  <span className="text-sm font-semibold text-slate-900">You pay</span>
                  <span className="font-extrabold text-blue-600 text-xl">₹{coupon.netAmount}</span>
                </div>
              )}
            </div>

            <div className="mb-3">
              {coupon ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 font-semibold text-emerald-700">
                    <TicketPercent className="w-4 h-4" /> {coupon.code} — ₹{coupon.discountAmount} off
                  </span>
                  <button onClick={() => setCoupon(null)} className="text-emerald-700 hover:text-emerald-900" aria-label="Remove coupon">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="input-field flex-1 uppercase"
                    placeholder="Coupon code"
                    value={couponInput}
                    onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
                  />
                  <button onClick={applyCoupon} disabled={applyingCoupon || !couponInput.trim()} className="btn-secondary px-4 disabled:opacity-60">
                    {applyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                  </button>
                </div>
              )}
              {couponError && <p className="text-xs text-red-500 mt-1.5">{couponError}</p>}
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-6 flex items-start gap-3">
              <Gift className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-emerald-700">
                  {FREE_TRIAL_MONTHS} months of patient access — free
                </p>
                <p className="text-xs text-emerald-600/80 mt-0.5">
                  Normally ₹{DOCTOR_SUBSCRIPTION_FEE}/month, you save <span className="font-bold">₹{TRIAL_VALUE.toLocaleString("en-IN")}</span> by registering now.
                </p>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {error}
              </div>
            )}

            <button onClick={pay} disabled={paying} className="btn-primary w-full justify-center py-3.5 text-base">
              {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Cashfree…</> : `Pay ₹${payable}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
