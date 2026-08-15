"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Clock, Loader2 } from "lucide-react";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20000;

export default function DoctorPaymentReturn() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "paid" | "pending" | "error">("checking");
  const startedAt = useRef<number>(0);

  useEffect(() => {
    startedAt.current = Date.now();
    let cancelled = false;
    const check = async () => {
      const res = await fetch("/api/doctors/me");
      if (cancelled) return;
      if (!res.ok) { setStatus("error"); return; }
      const data = await res.json();
      if (data?.doctorProfile?.registrationFeePaid) {
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
  }, []);

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center p-6">
      {status === "checking" && (
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-5" />
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Confirming your payment…</h2>
          <p className="text-slate-500">This usually takes just a few seconds.</p>
        </div>
      )}

      {status === "paid" && (
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-9 h-9 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Payment Successful!</h2>
          <p className="text-slate-500 mb-8">Your dashboard is now unlocked.</p>
          <button onClick={() => router.push("/doctor/dashboard")} className="btn-primary w-full justify-center py-3.5">
            Go to Dashboard
          </button>
        </div>
      )}

      {status === "pending" && (
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
            <Clock className="w-9 h-9 text-amber-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Still Confirming</h2>
          <p className="text-slate-500 mb-8">
            We haven&apos;t received confirmation yet — this can occasionally take a minute.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => router.push("/doctor/payment")} className="btn-secondary w-full justify-center py-3">
              Try Again
            </button>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <p className="text-slate-500 mb-8">Something went wrong checking your payment status.</p>
          <button onClick={() => router.push("/doctor/payment")} className="btn-primary w-full justify-center py-3.5">
            Back to Payment
          </button>
        </div>
      )}
    </div>
  );
}
