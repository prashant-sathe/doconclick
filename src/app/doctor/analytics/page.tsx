"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, TrendingUp, Star, PieChart } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import { hasActiveDoctorSubscription } from "@/lib/subscription";

interface MonthPoint {
  label: string;
  bookings: number;
  gross: number;
  platformFee: number;
  net: number;
}

interface ConsultTypeRow {
  type: string;
  count: number;
  net: number;
}

interface RatingMonthPoint {
  label: string;
  avgRating: number | null;
  count: number;
}

interface AnalyticsData {
  months: MonthPoint[];
  consultTypes: ConsultTypeRow[];
  ratings: { avgRating: number; totalReviews: number; monthly: RatingMonthPoint[] };
}

const CONSULT_TYPE_LABEL: Record<string, string> = {
  CLINIC: "Clinic Visit",
  HOME: "Home Visit",
  VIDEO: "Video Consult",
};

export default function DoctorAnalytics() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/analytics");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    fetch("/api/doctors/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.doctorProfile?.registrationFeePaid) { router.push("/doctor/profile"); return; }
        if (!hasActiveDoctorSubscription(d.doctorProfile)) { router.push("/doctor/subscribe"); return; }
        return fetch("/api/doctor/analytics")
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            setData(json);
            setLoading(false);
          });
      })
      .catch(() => setLoading(false));
  }, [user, router]);

  if (authLoading || loading || !user || !data) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  const maxNet = Math.max(1, ...data.months.map((m) => m.net));
  const totalConsults = data.consultTypes.reduce((s, c) => s + c.count, 0);
  const maxConsultCount = Math.max(1, ...data.consultTypes.map((c) => c.count));
  const ratedMonths = data.ratings.monthly.filter((m) => m.avgRating !== null);

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900">Analytics</h1>
          <p className="text-slate-500 text-sm">Your own trends over the last 6 months.</p>
        </div>

        {/* Tab switcher — Earnings has the ledger/payout detail, this page has the trends. */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
          <Link href="/doctor/earnings" className="px-4 py-1.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            Earnings
          </Link>
          <span className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-white text-teal-600 shadow-sm">
            Analytics
          </span>
        </div>

        {/* Monthly earnings trend */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-teal-500" /> Earnings Trend
          </h2>
          <p className="text-xs text-slate-400 mb-4">Net earnings by month, last 6 months.</p>
          <div className="flex items-end justify-between gap-2 h-36">
            {data.months.map((m) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-end justify-center h-28">
                  <div
                    className="w-full max-w-10 bg-teal-500 rounded-t-md transition-all"
                    style={{ height: `${Math.max(4, (m.net / maxNet) * 100)}%` }}
                    title={`₹${m.net.toLocaleString("en-IN")} · ${m.bookings} booking${m.bookings === 1 ? "" : "s"}`}
                  />
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">{m.label}</span>
                <span className="text-[9px] text-slate-300">{m.bookings}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Consult-type split */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
            <PieChart className="w-4 h-4 text-teal-500" /> Consult-Type Split
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            {totalConsults > 0 ? `${totalConsults} completed consultation${totalConsults === 1 ? "" : "s"}, last 6 months.` : "No completed consultations yet."}
          </p>
          {data.consultTypes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nothing to show yet.</p>
          ) : (
            <div className="space-y-3">
              {data.consultTypes.map((c) => (
                <div key={c.type}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700">{CONSULT_TYPE_LABEL[c.type] ?? c.type}</span>
                    <span className="text-slate-400">{c.count} · ₹{c.net.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full"
                      style={{ width: `${Math.max(3, (c.count / maxConsultCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rating trend */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
            <Star className="w-4 h-4 text-amber-400" /> Rating Trend
          </h2>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-2xl font-extrabold text-slate-900">{data.ratings.avgRating.toFixed(1)}</span>
            <span className="text-xs text-slate-400">overall · {data.ratings.totalReviews} review{data.ratings.totalReviews === 1 ? "" : "s"}</span>
          </div>
          {ratedMonths.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No reviews in the last 6 months yet.</p>
          ) : (
            <div className="flex items-end justify-between gap-2 h-28">
              {data.ratings.monthly.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end justify-center h-20">
                    {m.avgRating !== null ? (
                      <div
                        className="w-full max-w-10 bg-amber-400 rounded-t-md transition-all"
                        style={{ height: `${Math.max(6, (m.avgRating / 5) * 100)}%` }}
                        title={`${m.avgRating.toFixed(1)} ★ · ${m.count} review${m.count === 1 ? "" : "s"}`}
                      />
                    ) : (
                      <div className="w-full max-w-10 h-1 bg-slate-100 rounded-t-md" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold">{m.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
