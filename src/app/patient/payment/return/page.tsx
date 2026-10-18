"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Clock, Loader2, Wallet } from "lucide-react";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20000;
// If the webhook hasn't landed by then, ask the server to check with Cashfree
// directly — once early, and once more before giving up.
const VERIFY_AFTER_MS = 6000;

type VerifyResult = { paymentStatus: "PAID" | "CREDITED" | "PENDING"; creditedAmount?: number };

function ReturnContent() {
  const searchParams = useSearchParams();
  const apptId = searchParams.get("apptId");
  const [status, setStatus] = useState<"checking" | "paid" | "credited" | "pending" | "error">(apptId ? "checking" : "error");
  const [creditedAmount, setCreditedAmount] = useState<number | null>(null);
  const startedAt = useRef<number>(0);
  const verifiedEarly = useRef(false);

  useEffect(() => {
    if (!apptId) return;
    startedAt.current = Date.now();

    let cancelled = false;
    // true once settled (paid or credited) — stops the polling.
    const verify = async (): Promise<boolean> => {
      const res = await fetch("/api/payments/verify-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apptId }),
      });
      if (cancelled || !res.ok) return false;
      const result: VerifyResult = await res.json();
      if (result.paymentStatus === "PAID") { setStatus("paid"); return true; }
      if (result.paymentStatus === "CREDITED") {
        setCreditedAmount(result.creditedAmount ?? null);
        setStatus("credited");
        return true;
      }
      return false;
    };
    const check = async () => {
      const res = await fetch(`/api/appointments/${apptId}`);
      if (cancelled) return;
      if (!res.ok) { setStatus("error"); return; }
      const appt = await res.json();
      if (appt.paymentStatus === "PAID") {
        setStatus("paid");
        return;
      }
      const elapsed = Date.now() - startedAt.current;
      if (!verifiedEarly.current && elapsed > VERIFY_AFTER_MS) {
        verifiedEarly.current = true;
        if (await verify()) return;
      }
      if (elapsed > POLL_TIMEOUT_MS) {
        if (!(await verify()) && !cancelled) setStatus("pending");
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
    return () => { cancelled = true; };
  }, [apptId]);

  if (status === "checking") {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-5" />
        <h2 className="text-xl font-extrabold text-slate-900 mb-2">Confirming your payment…</h2>
        <p className="text-slate-500">This usually takes just a few seconds.</p>
      </div>
    );
  }

  if (status === "paid") {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-9 h-9 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Payment Successful!</h2>
        <p className="text-slate-500 mb-8">Your doctor will be notified.</p>
        <Link href="/patient/appointments" className="btn-primary w-full justify-center py-3.5">My Appointments</Link>
      </div>
    );
  }

  if (status === "credited") {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
          <Wallet className="w-9 h-9 text-blue-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Payment Credited to Wallet</h2>
        <p className="text-slate-500 mb-8">
          We received your payment, but couldn&apos;t apply it to this appointment — it may have been cancelled or
          already paid. {creditedAmount != null ? `₹${creditedAmount}` : "The amount"} has been added to your wallet,
          and you can use it for any booking.
        </p>
        <div className="flex flex-col gap-2">
          <Link href="/patient/wallet" className="btn-secondary w-full justify-center py-3">View Wallet</Link>
          <Link href="/patient/appointments" className="btn-primary w-full justify-center py-3.5">My Appointments</Link>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <Clock className="w-9 h-9 text-amber-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Still Confirming</h2>
        <p className="text-slate-500 mb-8">
          We haven&apos;t received confirmation yet — this can occasionally take a minute. Check My Appointments
          shortly, or try paying again if it doesn&apos;t update.
        </p>
        <div className="flex flex-col gap-2">
          {apptId && (
            <Link href={`/patient/payment?apptId=${apptId}`} className="btn-secondary w-full justify-center py-3">
              Try Again
            </Link>
          )}
          <Link href="/patient/appointments" className="btn-primary w-full justify-center py-3.5">My Appointments</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
      <p className="text-slate-500 mb-8">Something went wrong checking your payment status.</p>
      <Link href="/patient/appointments" className="btn-primary w-full justify-center py-3.5">My Appointments</Link>
    </div>
  );
}

export default function PaymentReturn() {
  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
      <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-slate-400">Loading…</div>}>
        <ReturnContent />
      </Suspense>
    </div>
  );
}
