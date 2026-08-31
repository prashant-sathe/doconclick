"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CreditCard, Loader2, ShieldCheck, CheckCircle, Wallet, TicketPercent, X } from "lucide-react";
import { formatDoctorName } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

interface AppointmentSummary {
  id: string;
  amount: number;
  discountAmount: number;
  couponCode: string | null;
  paymentStatus: string;
  doctor: { name: string };
}

function PaymentContent() {
  const searchParams = useSearchParams();
  const apptId = searchParams.get("apptId");

  const [appt, setAppt] = useState<AppointmentSummary | null>(null);
  const [loading, setLoading] = useState(!!apptId);
  const [paying, setPaying] = useState(false);
  const [payingWallet, setPayingWallet] = useState(false);
  const [error, setError] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [confirmWalletPay, setConfirmWalletPay] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    if (!apptId) return;
    fetch(`/api/appointments/${apptId}`)
      .then(async (r) => {
        if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Could not load this appointment."); return; }
        setAppt(await r.json());
      })
      .finally(() => setLoading(false));
    fetch(`/api/wallet/me?take=0`)
      .then((r) => r.json())
      .then((d) => setWalletBalance(d.balance ?? 0))
      .catch(() => {});
  }, [apptId]);

  const pay = async () => {
    if (!apptId) { setError("Missing appointment reference."); return; }
    setPaying(true);
    setError("");
    const res = await fetch("/api/payments/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: apptId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPaying(false);
      setError(data.error ?? "Could not start payment. Please try again.");
      return;
    }
    const { load } = await import("@cashfreepayments/cashfree-js");
    // NEXT_PUBLIC_ env vars are inlined at Docker *build* time, not container
    // runtime, so env_file: .env.production can't toggle this — hardcoded to
    // match the current production-only setup (see CASHFREE_ENV comment in
    // .env.production.example for how to add sandbox support later).
    const cashfree = await load({ mode: "production" });
    cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
    // Browser navigates away to Cashfree's hosted checkout from here.
  };

  const netPayable = appt ? Math.max(0, Math.round((appt.amount - appt.discountAmount) * 100) / 100) : 0;

  const applyCoupon = async () => {
    if (!apptId || !couponInput.trim()) return;
    setApplyingCoupon(true);
    setCouponError("");
    const res = await fetch("/api/coupons/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: apptId, code: couponInput.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setApplyingCoupon(false);
    if (!res.ok) {
      setCouponError(data.error ?? "Could not apply that coupon.");
      return;
    }
    setAppt((a) => (a ? { ...a, discountAmount: data.discountAmount, couponCode: data.coupon.code } : a));
    setCouponInput("");
  };

  const removeCoupon = async () => {
    if (!apptId) return;
    setApplyingCoupon(true);
    setCouponError("");
    await fetch("/api/coupons/apply", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: apptId }),
    }).catch(() => {});
    setApplyingCoupon(false);
    setAppt((a) => (a ? { ...a, discountAmount: 0, couponCode: null } : a));
  };

  const payWithWallet = async () => {
    if (!apptId) { setError("Missing appointment reference."); return; }
    setPayingWallet(true);
    setError("");
    const res = await fetch("/api/wallet/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: apptId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPayingWallet(false);
      setError(data.error ?? "Could not pay with wallet. Please try again.");
      return;
    }
    // Direct, synchronous result — no external redirect, so just flip the
    // component straight to the "Already Paid" branch below.
    setAppt((a) => (a ? { ...a, paymentStatus: "PAID" } : a));
  };

  if (loading) {
    return <div className="bg-white rounded-2xl p-8 text-center text-slate-400">Loading…</div>;
  }

  if (!apptId || !appt) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 max-w-md w-full text-center">
        <p className="text-slate-500">{error || "Appointment not found."}</p>
        <Link href="/patient/appointments" className="btn-secondary w-full justify-center mt-5">My Appointments</Link>
      </div>
    );
  }

  if (appt.paymentStatus === "PAID") {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-9 h-9 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Already Paid</h2>
        <p className="text-slate-500 mb-8">This appointment has already been paid for.</p>
        <Link href="/patient/appointments" className="btn-primary w-full justify-center py-3.5">My Appointments</Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 max-w-md w-full">
      <div className="bg-slate-50 rounded-xl p-4 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Consultation with {formatDoctorName(appt.doctor.name)}</span>
          <span className="text-slate-700">₹{appt.amount}</span>
        </div>
        {appt.discountAmount > 0 && (
          <div className="flex justify-between text-sm mt-1.5 text-emerald-600">
            <span>Coupon {appt.couponCode}</span>
            <span>−₹{appt.discountAmount}</span>
          </div>
        )}
        <div className="flex justify-between font-bold pt-2 mt-2 border-t border-slate-200 text-base">
          <span className="text-slate-900">{appt.discountAmount > 0 ? "You pay" : "Amount"}</span>
          <span className="text-blue-600">₹{netPayable}</span>
        </div>
      </div>

      {/* Coupon */}
      <div className="mb-4">
        {appt.couponCode ? (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-sm">
            <span className="flex items-center gap-2 font-semibold text-emerald-700">
              <TicketPercent className="w-4 h-4" /> {appt.couponCode} applied
            </span>
            <button
              onClick={removeCoupon}
              disabled={applyingCoupon}
              className="text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
              aria-label="Remove coupon"
            >
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
            <button
              onClick={applyCoupon}
              disabled={applyingCoupon || !couponInput.trim()}
              className="btn-secondary px-4 disabled:opacity-60"
            >
              {applyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
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

      {(() => {
        const canPayWithWallet = walletBalance != null && walletBalance >= netPayable;
        return (
          <div className="mb-3">
            <button
              onClick={() => setConfirmWalletPay(true)}
              disabled={payingWallet || paying || !canPayWithWallet}
              className="btn-secondary w-full justify-center py-3.5 text-base gap-1.5 disabled:opacity-60"
            >
              {payingWallet ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Paying from wallet…</>
              ) : walletBalance == null ? (
                <><Wallet className="w-4 h-4" /> Pay ₹{netPayable} via Wallet</>
              ) : canPayWithWallet ? (
                <><Wallet className="w-4 h-4" /> Pay ₹{netPayable} via Wallet (Balance ₹{walletBalance})</>
              ) : (
                <><Wallet className="w-4 h-4" /> Insufficient wallet balance</>
              )}
            </button>
            {walletBalance != null && !canPayWithWallet && (
              <p className="text-xs text-slate-400 text-center mt-1.5">
                You need ₹{Math.ceil(netPayable - walletBalance)} more —{" "}
                <Link href="/patient/wallet" className="text-blue-600 font-semibold hover:underline">top up your wallet</Link>.
              </p>
            )}
          </div>
        );
      })()}

      <button onClick={pay} disabled={paying || payingWallet} className="btn-primary w-full justify-center py-3.5 text-base">
        {paying
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Cashfree…</>
          : `Pay ₹${netPayable} via Cashfree`}
      </button>

      {confirmWalletPay && (
        <ConfirmDialog
          icon={Wallet}
          title={`Pay ₹${netPayable} from your wallet?`}
          message={`This deducts ₹${netPayable} from your wallet balance right now to confirm your consultation with ${formatDoctorName(appt.doctor.name)}.`}
          confirmLabel="Pay Now"
          busyLabel="Paying…"
          tone="primary"
          busy={payingWallet}
          onCancel={() => setConfirmWalletPay(false)}
          onConfirm={async () => {
            await payWithWallet();
            setConfirmWalletPay(false);
          }}
        />
      )}
    </div>
  );
}

export default function PatientPayment() {
  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
      <div className="fixed top-[calc(1.25rem_+_var(--safe-area-inset-top,env(safe-area-inset-top)))] left-6">
        <Link href="/patient/appointments" className="btn-ghost gap-1.5 text-sm">← Back</Link>
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <CreditCard className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Complete Payment</h1>
          <p className="text-slate-500 mt-2 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> Secured by Cashfree
          </p>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-slate-400">Loading…</div>}>
          <PaymentContent />
        </Suspense>
      </div>
    </div>
  );
}
