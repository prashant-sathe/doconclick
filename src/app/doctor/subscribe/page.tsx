"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, CheckCircle, Loader2, ShieldCheck, TicketPercent, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { hasActiveDoctorSubscription } from "@/lib/subscription";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";
import DuesPayCard from "@/components/doctor/DuesPayCard";

const SUBSCRIPTION_FEE = 499;

interface DoctorProfileStatus {
  registrationFeePaid: boolean;
  trialEndsAt: string | null;
  subscriptionPaidUntil: string | null;
}

export default function DoctorSubscribe() {
  const t = useTranslations("doctorAccount.pay");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const locale = formattingLocale(useLocale());
  const [paying, setPaying] = useState(false);
  const [profile, setProfile] = useState<DoctorProfileStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountAmount: number; netAmount: number } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/subscribe");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    fetch("/api/doctors/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.doctorProfile && !d.doctorProfile.registrationFeePaid) {
          router.push("/doctor/payment");
          return;
        }
        setProfile(d?.doctorProfile ?? null);
      })
      .finally(() => setChecking(false));
  }, [user, router]);

  const payable = coupon ? coupon.netAmount : SUBSCRIPTION_FEE;

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setApplyingCoupon(true);
    setCouponError("");
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponInput.trim(), context: "DOCTOR_SUBSCRIPTION" }),
    });
    const data = await res.json().catch(() => ({}));
    setApplyingCoupon(false);
    if (!res.ok) { setCouponError(data.error ?? t("couponFailed")); return; }
    setCoupon({ code: data.code, discountAmount: data.discountAmount, netAmount: data.netAmount });
    setCouponInput("");
  };

  const pay = async () => {
    setPaying(true);
    setError("");
    const res = await fetch("/api/doctors/subscription/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coupon ? { code: coupon.code } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPaying(false);
      setError(data.error ?? t("startFailed"));
      return;
    }
    const { load } = await import("@cashfreepayments/cashfree-js");
    const cashfree = await load({ mode: "production" });
    cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
  };

  if (authLoading || !user || checking || !profile) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>;
  }

  const active = hasActiveDoctorSubscription(profile);
  const activeUntil = profile.trialEndsAt && (!profile.subscriptionPaidUntil || new Date(profile.trialEndsAt) > new Date(profile.subscriptionPaidUntil))
    ? profile.trialEndsAt
    : profile.subscriptionPaidUntil;

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <CreditCard className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">{active ? t("yourPlan") : t("renewPlan")}</h1>
          <p className="text-slate-500 mt-2">{t("perMonth", { amount: SUBSCRIPTION_FEE })}</p>
          <p className="text-slate-500 mt-2 flex items-center justify-center gap-1.5 text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> {t("securedByCashfree")}
          </p>
        </div>

        {/* A lapsed doctor can't open Earnings, so what they owe on cash visits is payable here too. */}
        <DuesPayCard returnTo="subscribe" />

        {active ? (
          <div className="bg-white rounded-2xl shadow-xl p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-9 h-9 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-2">{t("planActive")}</h2>
            <p className="text-slate-500 mb-8">
              {activeUntil ? t("validUntil", { date: new Date(activeUntil).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Kolkata" }) }) : ""}
            </p>
            <button onClick={() => router.push("/doctor/dashboard")} className="btn-primary w-full justify-center py-3.5 text-base">
              {t("goToDashboard")}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
            <div className="bg-slate-50 rounded-xl p-4 mb-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">{t("monthlyPlan")}</span>
                <span className={`font-extrabold text-xl ${coupon ? "text-slate-400 line-through" : "text-blue-600"}`}>₹{SUBSCRIPTION_FEE}</span>
              </div>
              {coupon && (
                <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-200">
                  <span className="text-sm font-semibold text-slate-900">{t("youPay")}</span>
                  <span className="font-extrabold text-blue-600 text-xl">₹{coupon.netAmount}</span>
                </div>
              )}
            </div>

            <div className="mb-4">
              {coupon ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 font-semibold text-emerald-700">
                    <TicketPercent className="w-4 h-4" /> {t("couponOff", { code: coupon.code, amount: coupon.discountAmount })}
                  </span>
                  <button onClick={() => setCoupon(null)} className="text-emerald-700 hover:text-emerald-900" aria-label={t("removeCoupon")}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="input-field flex-1 uppercase"
                    placeholder={t("couponCode")}
                    value={couponInput}
                    onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
                  />
                  <button onClick={applyCoupon} disabled={applyingCoupon || !couponInput.trim()} className="btn-secondary px-4 disabled:opacity-60">
                    {applyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : t("apply")}
                  </button>
                </div>
              )}
              {couponError && <p className="text-xs text-red-500 mt-1.5">{couponError}</p>}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {error}
              </div>
            )}

            <button onClick={pay} disabled={paying} className="btn-primary w-full justify-center py-3.5 text-base">
              {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("redirecting")}</> : t("payAmount", { amount: payable })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
