"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle, Clock, Loader2, Wallet } from "lucide-react";
import { PayShell, Card, type GuestBill } from "../shell";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20000;
// Same cadence as /patient/payment/return: if the webhook hasn't landed,
// ask the server to check with Cashfree directly — once early, once at the end.
const VERIFY_AFTER_MS = 6000;

function ReturnContent() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get("t") ?? "";
  const [status, setStatus] = useState<"checking" | "paid" | "credited" | "pending" | "error">(token ? "checking" : "error");
  const [credited, setCredited] = useState<number | null>(null);
  const startedAt = useRef(0);
  const verifiedEarly = useRef(false);

  useEffect(() => {
    if (!token) return;
    startedAt.current = Date.now();
    let cancelled = false;

    // true once settled — stops the polling.
    const read = async (verify: boolean): Promise<boolean | null> => {
      const res = await fetch(`/api/payments/guest-status?t=${encodeURIComponent(token)}${verify ? "&verify=1" : ""}`, { cache: "no-store" }).catch(() => null);
      if (cancelled) return true;
      if (!res?.ok) return verify ? false : null;
      const bill: GuestBill = await res.json();
      if (bill.paymentStatus === "PAID") { setStatus("paid"); return true; }
      if (bill.creditedAmount != null) { setCredited(bill.creditedAmount); setStatus("credited"); return true; }
      return false;
    };
    const check = async () => {
      const done = await read(false);
      if (cancelled || done) return;
      if (done === null) { setStatus("error"); return; }
      const elapsed = Date.now() - startedAt.current;
      if (!verifiedEarly.current && elapsed > VERIFY_AFTER_MS) {
        verifiedEarly.current = true;
        if (await read(true)) return;
      }
      if (elapsed > POLL_TIMEOUT_MS) {
        if (!(await read(true)) && !cancelled) setStatus("pending");
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };
    void check();
    return () => { cancelled = true; };
  }, [token]);

  if (status === "checking") {
    return (
      <Card>
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-5" />
        <h1 className="text-xl font-extrabold text-slate-900 mb-2">Confirming your payment…</h1>
        <p className="text-slate-500">This usually takes just a few seconds.</p>
      </Card>
    );
  }
  if (status === "paid") {
    return (
      <Card>
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-9 h-9 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Payment successful</h1>
        <p className="text-slate-500">The clinic can see it&apos;s paid. You can close this page.</p>
      </Card>
    );
  }
  if (status === "credited") {
    return (
      <Card>
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
          <Wallet className="w-9 h-9 text-blue-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Payment kept as credit</h1>
        <p className="text-slate-500">
          We received {credited != null ? `₹${credited}` : "your payment"}, but this appointment had changed (it may have been
          cancelled or already paid), so it was added to your DocOnClick wallet. Sign up in the app with this mobile number to use it, or ask the clinic.
        </p>
      </Card>
    );
  }
  if (status === "pending") {
    return (
      <Card>
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <Clock className="w-9 h-9 text-amber-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Still confirming</h1>
        <p className="text-slate-500 mb-6">
          We haven&apos;t heard back from the bank yet — this can take a minute. If money left your account, don&apos;t pay again; the clinic will see it once it&apos;s confirmed.
        </p>
        <Link href={`/pay/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`} className="btn-secondary w-full justify-center py-3">Check again</Link>
      </Card>
    );
  }
  return <Card><p className="text-slate-600">This payment link isn&apos;t valid any more. Ask the clinic for a new one.</p></Card>;
}

export default function GuestPayReturnPage() {
  return (
    <PayShell>
      <Suspense fallback={<Card><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></Card>}>
        <ReturnContent />
      </Suspense>
    </PayShell>
  );
}
