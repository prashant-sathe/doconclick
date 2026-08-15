"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Clock, Loader2 } from "lucide-react";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20000;

function ReturnContent() {
  const searchParams = useSearchParams();
  const apptId = searchParams.get("apptId");
  const [status, setStatus] = useState<"checking" | "paid" | "pending" | "error">(apptId ? "checking" : "error");
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!apptId) return;
    startedAt.current = Date.now();

    let cancelled = false;
    const check = async () => {
      const res = await fetch(`/api/appointments/${apptId}`);
      if (cancelled) return;
      if (!res.ok) { setStatus("error"); return; }
      const appt = await res.json();
      if (appt.paymentStatus === "PAID") {
        setStatus("paid");
        return;
      }
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setStatus("pending");
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
    <div className="min-h-screen gradient-surface flex items-center justify-center p-6">
      <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-slate-400">Loading…</div>}>
        <ReturnContent />
      </Suspense>
    </div>
  );
}
