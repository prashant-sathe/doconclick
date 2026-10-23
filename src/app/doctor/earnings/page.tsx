"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, IndianRupee, TrendingUp, CreditCard, Send, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import DuesPayCard from "@/components/doctor/DuesPayCard";
import LoadError from "@/components/LoadError";
import { hasActiveDoctorSubscription } from "@/lib/subscription";
import { sumMoney } from "@/lib/money";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

const CONSULT_TYPES = ["CLINIC", "HOME", "VIDEO"] as const;
const isConsultType = (s: string): s is (typeof CONSULT_TYPES)[number] => (CONSULT_TYPES as readonly string[]).includes(s);

// One row of GET /api/doctor/earnings — only what the list shows.
interface Transaction {
  id: string;
  consultType: string;
  amount: number;
  platformFee: number;
  paymentMethod: string;
  scheduledAt: string;
  patientName: string | null;
  relation: string;
  patient: { name: string };
}

interface EarningsSummary {
  total: number;
  thisMonth: number;
  lastMonth: number;
  days: { key: string; value: number }[];
  transactions: Transaction[];
  hasMore: boolean;
}

function patientLabel(a: Transaction): string {
  return a.relation !== "Self" && a.patientName ? a.patientName : a.patient.name;
}

interface SettlementRecord {
  id: string;
  cashCount: number;
  onlineCount: number;
  cashFeeOwed: number;
  onlinePayoutOwed: number;
  netAmount: number;
  createdAt: string;
}

interface PayoutRequestRecord {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

// What's owed right now (src/lib/payouts.ts): online payouts net of the
// platform fee on cash visits — the amount a payout request asks for.
interface Dues {
  cashCount: number;
  onlineCount: number;
  cashFeeOwed: number;
  onlinePayoutOwed: number;
  netAmount: number;
}

export default function DoctorEarnings() {
  const t = useTranslations("doctorAccount.earnings");
  const tTabs = useTranslations("doctorAccount.tabs");
  const tType = useTranslations("doctorAccount.analytics.type");
  const locale = formattingLocale(useLocale());
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequestRecord[]>([]);
  const [dues, setDues] = useState<Dues | null>(null);
  const [bankOnFile, setBankOnFile] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  // Blocks a second tap before the disabled state renders (BUG-TRACKER #72).
  const payoutInFlight = useRef(false);
  const tLoad = useTranslations("shared.loadError");

  // A failed fetch is an error card with Retry — never ₹0 and never a redirect.
  // Only a successful /api/doctors/me saying "not paid / no plan" redirects.
  const load = useCallback(async () => {
    try {
      const meRes = await fetch("/api/doctors/me");
      if (!meRes.ok) throw new Error("profile");
      const d = await meRes.json();
      if (!d?.doctorProfile?.registrationFeePaid) { router.push("/doctor/profile"); return; }
      if (!hasActiveDoctorSubscription(d.doctorProfile)) { router.push("/doctor/subscribe"); return; }
      const [eRes, sRes, pRes] = await Promise.all([
        fetch("/api/doctor/earnings"),
        fetch("/api/doctor/settlements"),
        fetch("/api/doctor/payout-requests"),
      ]);
      if (!eRes.ok || !sRes.ok || !pRes.ok) throw new Error("earnings");
      const [e, settled, payouts] = await Promise.all([eRes.json(), sRes.json(), pRes.json()]);
      setSummary(e);
      setTransactions(e.transactions);
      setHasMore(e.hasMore);
      setSettlements(settled);
      setPayoutRequests(payouts?.requests ?? []);
      setDues(payouts?.dues ?? null);
      setBankOnFile(payouts?.bankDetailsOnFile ?? true);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Keyed on the id, not the `user` object: AuthProvider hands out a fresh
  // object on every re-check, which would refetch all of this every 30s.
  const userId = user?.id;
  const userRole = user?.role;
  useEffect(() => {
    if (!userId || userRole !== "DOCTOR") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is the fetch-on-mount
    void load();
  }, [userId, userRole, load]);

  const retry = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(false);
    try {
      const res = await fetch(`/api/doctor/earnings?skip=${transactions.length}`);
      if (!res.ok) throw new Error("more");
      const e: EarningsSummary = await res.json();
      setTransactions((cur) => [...cur, ...e.transactions]);
      setHasMore(e.hasMore);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  if (loadFailed && !summary) {
    return (
      <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
        <DoctorHeader />
        <DoctorMobileNav />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <LoadError error={tLoad("generic")} onRetry={retry} retrying={retrying} />
        </div>
      </div>
    );
  }

  const net = (a: Transaction) => sumMoney([a.amount, -a.platformFee]);
  const totalEarnings = summary?.total ?? 0;
  const thisMonthEarnings = summary?.thisMonth ?? 0;
  const lastMonthEarnings = summary?.lastMonth ?? 0;
  const netPayout = dues?.netAmount ?? 0;
  const openPayoutRequest = payoutRequests.find((r) => r.status === "PENDING") ?? null;

  const requestPayout = async () => {
    if (payoutInFlight.current) return;
    payoutInFlight.current = true;
    setRequestingPayout(true);
    setPayoutError("");
    const res = await fetch("/api/doctor/payout-requests", { method: "POST" }).finally(() => {
      payoutInFlight.current = false;
      setRequestingPayout(false);
    });
    if (res.ok) {
      const created: PayoutRequestRecord = await res.json();
      setPayoutRequests((cur) => [created, ...cur]);
    } else {
      const body = await res.json().catch(() => ({}));
      if (body.code === "BANK_DETAILS_REQUIRED") setBankOnFile(false);
      if (body.dues) setDues(body.dues);
      setPayoutError(body.error ?? t("payoutFailed"));
    }
  };

  // Last 7 days bar breakdown (Monday first; IST days computed by the server)
  const days = (summary?.days ?? []).map((d) => {
    const [y, m, dd] = d.key.split("-").map(Number);
    const label = new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" });
    return { key: d.key, label, value: d.value };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.value));
  const recent = transactions;

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm">{t("subtitle")}</p>
        </div>

        {/* Tab switcher — this page has the ledger/payout detail, Analytics has the trends. */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
          <span className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-white text-teal-600 shadow-sm">
            {tTabs("earnings")}
          </span>
          <Link href="/doctor/analytics" className="px-4 py-1.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            {tTabs("analytics")}
          </Link>
        </div>

        {/* Headline number gets the hero treatment; the rest stays secondary */}
        <div className="gradient-hero rounded-2xl p-5 mb-4 text-white shadow-lg">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/70 mb-1 flex items-center gap-1.5">
            <IndianRupee className="w-3.5 h-3.5" /> {t("total")}
          </p>
          <p className="text-3xl font-extrabold">₹{totalEarnings.toLocaleString("en-IN")}</p>
          <div className="h-px bg-white/15 my-4" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/65 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> {t("thisMonth")}
              </p>
              <p className="text-[16px] font-extrabold mt-0.5">₹{thisMonthEarnings.toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/65 flex items-center gap-1">
                <CreditCard className="w-3 h-3" /> {netPayout < 0 ? t("youOwe") : t("netPayout")}
              </p>
              <p className="text-[16px] font-extrabold mt-0.5">₹{Math.abs(netPayout).toLocaleString("en-IN")}</p>
            </div>
          </div>
        </div>

        {/* Payout request — settling is still an admin action, this just
            flags to them that this doctor is actively asking, instead of
            waiting for the admin to notice on their own settle queue. */}
        {openPayoutRequest ? (
          <div className="flex items-center gap-3 bg-teal-50 border border-teal-100 rounded-2xl p-4 mb-6">
            <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
            {/* Settling pays what's owed when the admin settles (it keeps
                moving with new visits) — so show that, not the figure at request time. */}
            <p className="text-sm text-teal-800">
              {t.rich("requestedOn", {
                date: new Date(openPayoutRequest.createdAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Kolkata" }),
                b: (c) => <span className="font-bold">{c}</span>,
              })}{" "}
              {netPayout > 0
                ? t.rich("paidWhenSettled", { amount: netPayout.toLocaleString("en-IN"), b: (c) => <span className="font-bold">{c}</span> })
                : t("nothingOwed")}
              {openPayoutRequest.amount !== netPayout && <span className="text-teal-700/70"> {t("whenAsked", { amount: openPayoutRequest.amount.toLocaleString("en-IN") })}</span>}.
            </p>
          </div>
        ) : netPayout > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {t.rich("waiting", { amount: netPayout.toLocaleString("en-IN"), b: (c) => <span className="font-bold text-slate-800">{c}</span> })}
              </p>
              {bankOnFile && (
                <button onClick={requestPayout} disabled={requestingPayout} className="btn-primary py-1.5 px-3 text-xs gap-1.5 flex-shrink-0">
                  {requestingPayout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {t("requestPayout")}
                </button>
              )}
            </div>
            {dues && dues.cashFeeOwed > 0 && (
              <p className="text-xs text-slate-400 mt-1.5">
                {t("duesBreakdown", { online: dues.onlinePayoutOwed.toLocaleString("en-IN"), fee: dues.cashFeeOwed.toLocaleString("en-IN") })}
              </p>
            )}
            {!bankOnFile && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3">
                {t("addBankHint")}{" "}
                <Link href="/doctor/profile/bank" className="font-bold underline">{t("addBank")}</Link>
              </p>
            )}
          </div>
        )}
        {payoutError && <p className="text-xs text-red-600 mb-6 -mt-4">{payoutError}</p>}

        <DuesPayCard
          returnTo="earnings"
          onSettled={() => {
            void fetch("/api/doctor/settlements").then((r) => (r.ok ? r.json() : null)).then((x) => { if (x) setSettlements(x); });
            void fetch("/api/doctor/payout-requests").then((r) => (r.ok ? r.json() : null)).then((x) => {
              if (x) { setPayoutRequests(x.requests ?? []); setDues(x.dues ?? null); }
            });
          }}
        />

        {lastMonthEarnings > 0 && (
          <p className="text-xs text-slate-400 mb-6">
            {t(thisMonthEarnings >= lastMonthEarnings ? "lastMonthUp" : "lastMonthDown", { amount: lastMonthEarnings.toLocaleString("en-IN") })}
          </p>
        )}

        {/* Weekly bar breakdown */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-slate-800 mb-4">{t("thisWeek")}</h2>
          <div className="flex items-end justify-between gap-2 h-32">
            {days.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-end justify-center h-24">
                  <div
                    className="w-full max-w-8 bg-teal-500 rounded-t-md transition-all"
                    style={{ height: `${Math.max(4, (d.value / maxDay) * 100)}%` }}
                    title={`₹${d.value}`}
                  />
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">{t("recent")}</h2>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">{t("noCompleted")}</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {recent.map((a) => (
                <div key={a.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{patientLabel(a)}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(a.scheduledAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Kolkata" })} · {isConsultType(a.consultType) ? tType(a.consultType) : a.consultType} · {a.paymentMethod === "ONLINE" ? t("online") : t("cash")}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-emerald-600">+₹{net(a).toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-slate-400">{t("feeLine", { amount: a.amount, fee: a.platformFee })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {moreError && <p className="text-xs text-red-600 text-center py-2 border-t border-slate-100">{tLoad("generic")}</p>}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 border-t border-slate-100 text-xs font-semibold text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-60"
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t("loadMore", { count: 10 })}
            </button>
          )}
        </div>

        {/* Settlement history */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">{t("settlements")}</h2>
          </div>
          {settlements.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">{t("noSettlements")}</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {settlements.map((s) => (
                <div key={s.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {new Date(s.createdAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Kolkata" })}
                    </p>
                    <p className="text-xs text-slate-400">{t("settlementCounts", { cash: s.cashCount, online: s.onlineCount })}</p>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${s.netAmount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {s.netAmount < 0 ? "−" : "+"}₹{Math.abs(s.netAmount).toLocaleString("en-IN")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
