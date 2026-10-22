"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Wallet, CheckCircle2, Clock, Send, History } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { NurseHeader, NurseMobileNav } from "@/components/nurse/NurseNav";
import { money, sumMoney } from "@/lib/money";

type Visit = {
  id: string; status: string; paymentStatus: string; paymentMethod: string; settlementId: string | null;
  amount: number; platformFee: number; serviceName: string | null; scheduledAt: string;
  patientName: string | null; relation: string; patient: { name: string };
};
type Settlement = { id: string; netAmount: number; onlineCount: number; createdAt: string; note: string | null };
type PayoutRequest = { id: string; amount: number; status: string; createdAt: string };
// What's owed right now (src/lib/payouts.ts): online payouts net of the
// platform fee on any cash visits — the amount a payout request asks for.
type Dues = { cashCount: number; onlineCount: number; cashFeeOwed: number; onlinePayoutOwed: number; netAmount: number };

const inr = (n: number) => `₹${money(n).toLocaleString("en-IN")}`;

// Same ledger rules as the doctor earnings page: completed + paid visits not
// yet in a settlement are what the platform owes, net of the commission on
// any visit paid in cash.
export default function NurseEarningsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [dues, setDues] = useState<Dues | null>(null);
  const [bankOnFile, setBankOnFile] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/nurse/earnings");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    const [a, s, r] = await Promise.all([
      fetch("/api/appointments/me").then((x) => (x.ok ? x.json() : [])),
      fetch("/api/doctor/settlements").then((x) => (x.ok ? x.json() : [])),
      fetch("/api/doctor/payout-requests").then((x) => (x.ok ? x.json() : null)),
    ]);
    setVisits(a); setSettlements(s);
    setRequests(r?.requests ?? []); setDues(r?.dues ?? null); setBankOnFile(r?.bankDetailsOnFile ?? true);
  }, []);

  // On the role, not the `user` object — AuthProvider re-polls every 30s with a fresh one.
  const isNurse = user?.role === "NURSE";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isNurse) load();
  }, [isNurse, load]);

  if (authLoading || !user || visits === null) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-rose-500" /></div>;
  }

  const completed = visits.filter((v) => v.status === "COMPLETED" && v.paymentStatus === "PAID");
  const unsettled = completed.filter((v) => !v.settlementId);
  const pendingPayout = dues?.netAmount ?? 0;
  const lifetime = sumMoney(completed.flatMap((v) => [v.amount, -v.platformFee]));
  const openRequest = requests.find((r) => r.status === "PENDING") ?? null;

  const requestPayout = async () => {
    setRequesting(true); setError("");
    const res = await fetch("/api/doctor/payout-requests", { method: "POST" });
    setRequesting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.code === "BANK_DETAILS_REQUIRED") setBankOnFile(false);
      setError(body.error ?? "Could not send the payout request.");
      return;
    }
    load();
  };

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <NurseHeader />
      <NurseMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-2xl font-extrabold text-slate-900 mb-4">Earnings</h1>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />{pendingPayout < 0 ? "You owe" : "Net payout"}</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{inr(Math.abs(pendingPayout))}</p>
            <p className="text-[11px] text-slate-400">
              {unsettled.length} visit{unsettled.length === 1 ? "" : "s"}
              {dues && dues.cashFeeOwed > 0 && ` · ${inr(dues.onlinePayoutOwed)} online − ${inr(dues.cashFeeOwed)} fee on cash visits`}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Lifetime earnings</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{inr(lifetime)}</p>
            <p className="text-[11px] text-slate-400">{completed.length} completed</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
          {openRequest ? (
            <p className="text-sm text-amber-700 flex items-center gap-1.5"><Clock className="w-4 h-4" />
              {/* Settled at what's owed then, not the figure at request time. */}
              <span>
                Payout requested on {new Date(openRequest.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} — the admin will settle it soon.{" "}
                {pendingPayout > 0 ? <>You&apos;ll be paid what&apos;s owed then: <b>{inr(pendingPayout)}</b> right now</> : <>Nothing is owed to you right now</>}
                {openRequest.amount !== pendingPayout && <span className="opacity-70"> ({inr(openRequest.amount)} when you asked)</span>}.
              </span>
            </p>
          ) : !bankOnFile && pendingPayout > 0 ? (
            <p className="text-sm text-amber-700">
              Add your bank details to request a payout.{" "}
              <Link href="/nurse/profile#bank" className="font-bold underline">Add bank details →</Link>
            </p>
          ) : (
            <button onClick={requestPayout} disabled={requesting || pendingPayout <= 0} className="btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-50">
              {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Request payout
            </button>
          )}
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>

        <h2 className="font-bold text-slate-800 mb-2">Completed visits</h2>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50 mb-6">
          {completed.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No completed visits yet.</p>
          ) : completed.map((v) => (
            <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{v.serviceName ?? "Nursing visit"}</p>
                <p className="text-xs text-slate-400 truncate">
                  {v.relation !== "Self" && v.patientName ? v.patientName : v.patient.name} · {new Date(v.scheduledAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-slate-900">{inr(v.amount - v.platformFee)}</p>
                <p className="text-[11px] text-slate-400">{v.settlementId ? "Settled" : "Pending"}</p>
              </div>
            </div>
          ))}
        </div>

        <h2 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5"><History className="w-4 h-4" />Settlement history</h2>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
          {settlements.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No settlements yet.</p>
          ) : settlements.map((s) => (
            <div key={s.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{inr(s.netAmount)}</p>
                <p className="text-xs text-slate-400">{s.onlineCount} visit{s.onlineCount === 1 ? "" : "s"} · {new Date(s.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
              </div>
              {s.note && <p className="text-xs text-slate-500 max-w-[50%] truncate">{s.note}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
