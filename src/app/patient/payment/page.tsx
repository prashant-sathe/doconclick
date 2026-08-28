"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CreditCard, Loader2, ShieldCheck, CheckCircle, Wallet } from "lucide-react";
import { formatDoctorName } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

interface AppointmentSummary {
  id: string;
  amount: number;
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
      <div className="bg-slate-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Consultation with {formatDoctorName(appt.doctor.name)}</span>
        </div>
        <div className="flex justify-between font-bold pt-2 mt-2 border-t border-slate-200 text-base">
          <span className="text-slate-900">Amount</span>
          <span className="text-blue-600">₹{appt.amount}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {(() => {
        const canPayWithWallet = walletBalance != null && walletBalance >= appt.amount;
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
                <><Wallet className="w-4 h-4" /> Pay ₹{appt.amount} via Wallet</>
              ) : canPayWithWallet ? (
                <><Wallet className="w-4 h-4" /> Pay ₹{appt.amount} via Wallet (Balance ₹{walletBalance})</>
              ) : (
                <><Wallet className="w-4 h-4" /> Insufficient wallet balance</>
              )}
            </button>
            {walletBalance != null && !canPayWithWallet && (
              <p className="text-xs text-slate-400 text-center mt-1.5">
                You need ₹{Math.ceil(appt.amount - walletBalance)} more —{" "}
                <Link href="/patient/wallet" className="text-blue-600 font-semibold hover:underline">top up your wallet</Link>.
              </p>
            )}
          </div>
        );
      })()}

      <button onClick={pay} disabled={paying || payingWallet} className="btn-primary w-full justify-center py-3.5 text-base">
        {paying
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Cashfree…</>
          : `Pay ₹${appt.amount} via Cashfree`}
      </button>

      {confirmWalletPay && (
        <ConfirmDialog
          icon={Wallet}
          title={`Pay ₹${appt.amount} from your wallet?`}
          message={`This deducts ₹${appt.amount} from your wallet balance right now to confirm your consultation with ${formatDoctorName(appt.doctor.name)}.`}
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
