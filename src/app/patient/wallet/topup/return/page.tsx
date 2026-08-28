"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Clock, XCircle, Loader2 } from "lucide-react";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20000;

function ReturnContent() {
  const searchParams = useSearchParams();
  const txnId = searchParams.get("txnId");
  const [status, setStatus] = useState<"checking" | "success" | "pending" | "failed" | "error">(txnId ? "checking" : "error");
  const [amount, setAmount] = useState<number | null>(null);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!txnId) return;
    startedAt.current = Date.now();

    let cancelled = false;
    const check = async () => {
      const res = await fetch(`/api/wallet/transactions/${txnId}`);
      if (cancelled) return;
      if (!res.ok) { setStatus("error"); return; }
      const txn = await res.json();
      setAmount(txn.amount);
      if (txn.status === "SUCCESS") { setStatus("success"); return; }
      if (txn.status === "FAILED") { setStatus("failed"); return; }
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setStatus("pending");
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
    return () => { cancelled = true; };
  }, [txnId]);

  if (status === "checking") {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-5" />
        <h2 className="text-xl font-extrabold text-slate-900 mb-2">Confirming your top-up…</h2>
        <p className="text-slate-500">This usually takes just a few seconds.</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-9 h-9 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Wallet Topped Up!</h2>
        <p className="text-slate-500 mb-8">{amount ? `₹${amount} has been added to your wallet.` : "Money has been added to your wallet."}</p>
        <Link href="/patient/wallet" className="btn-primary w-full justify-center py-3.5">Go to Wallet</Link>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
          <XCircle className="w-9 h-9 text-red-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Top-Up Failed</h2>
        <p className="text-slate-500 mb-8">Your payment didn&apos;t go through. No amount was deducted.</p>
        <Link href="/patient/wallet" className="btn-primary w-full justify-center py-3.5">Try Again</Link>
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
          We haven&apos;t received confirmation yet — this can occasionally take a minute. Check your wallet shortly.
        </p>
        <Link href="/patient/wallet" className="btn-primary w-full justify-center py-3.5">Go to Wallet</Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
      <p className="text-slate-500 mb-8">Something went wrong checking your top-up status.</p>
      <Link href="/patient/wallet" className="btn-primary w-full justify-center py-3.5">Go to Wallet</Link>
    </div>
  );
}

export default function WalletTopUpReturn() {
  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
      <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-slate-400">Loading…</div>}>
        <ReturnContent />
      </Suspense>
    </div>
  );
}
