"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, IndianRupee, TrendingUp, CreditCard, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import { hasActiveDoctorSubscription } from "@/lib/subscription";

interface Appointment {
  id: string;
  status: string;
  consultType: string;
  amount: number;
  platformFee: number;
  paymentMethod: string;
  paymentStatus: string;
  scheduledAt: string;
  settlementId: string | null;
  patientName: string | null;
  relation: string;
  patient: { name: string };
}

function patientLabel(a: Appointment): string {
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

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export default function DoctorEarnings() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/earnings");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    fetch("/api/doctors/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.doctorProfile?.registrationFeePaid) { router.push("/doctor/profile"); return; }
        if (!hasActiveDoctorSubscription(d.doctorProfile)) { router.push("/doctor/subscribe"); return; }
        return Promise.all([
          fetch("/api/appointments/me").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/doctor/settlements").then((r) => (r.ok ? r.json() : [])),
        ]).then(([appts, settled]) => {
          setAppointments(appts);
          setSettlements(settled);
          setLoading(false);
        });
      })
      .catch(() => setLoading(false));
  }, [user, router]);

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  const completed = appointments.filter((a) => a.status === "COMPLETED" && a.paymentStatus === "PAID");
  const net = (a: Appointment) => a.amount - a.platformFee;

  const now = new Date();
  const thisMonth = completed.filter((a) => {
    const d = new Date(a.scheduledAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = completed.filter((a) => {
    const d = new Date(a.scheduledAt);
    return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear();
  });

  const totalEarnings = completed.reduce((sum, a) => sum + net(a), 0);
  const thisMonthEarnings = thisMonth.reduce((sum, a) => sum + net(a), 0);
  const lastMonthEarnings = lastMonth.reduce((sum, a) => sum + net(a), 0);
  const unsettled = completed.filter((a) => !a.settlementId);
  const onlinePending = unsettled.filter((a) => a.paymentMethod === "ONLINE").reduce((sum, a) => sum + net(a), 0);
  const platformFeeDue = unsettled.filter((a) => a.paymentMethod === "CASH").reduce((sum, a) => sum + a.platformFee, 0);

  // Last 7 days bar breakdown
  const weekStart = startOfWeek(now);
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dayEarnings = completed
      .filter((a) => {
        const ad = new Date(a.scheduledAt);
        return ad.toDateString() === d.toDateString();
      })
      .reduce((sum, a) => sum + net(a), 0);
    return { label: d.toLocaleDateString("en-IN", { weekday: "short" }), value: dayEarnings };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.value));

  const recentAll = [...completed].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  const recent = recentAll.slice(0, visibleCount);

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900">Earnings</h1>
          <p className="text-slate-500 text-sm">Your consultation income, net of platform commission.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {[
            { label: "Total Earnings", value: `₹${totalEarnings.toLocaleString("en-IN")}`, icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "This Month", value: `₹${thisMonthEarnings.toLocaleString("en-IN")}`, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Online (Payout Pending)", value: `₹${onlinePending.toLocaleString("en-IN")}`, icon: CreditCard, color: "text-purple-600", bg: "bg-purple-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`${bg} rounded-2xl p-4`}>
              <Icon className={`w-4 h-4 ${color} mb-2`} />
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-lg font-extrabold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {platformFeeDue > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4 mb-6">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">
              <span className="font-bold">₹{platformFeeDue.toLocaleString("en-IN")} platform fee due</span> on cash consultations you&apos;ve collected. Admin will settle this with you.
            </p>
          </div>
        )}

        {lastMonthEarnings > 0 && (
          <p className="text-xs text-slate-400 mb-6">
            Last month: ₹{lastMonthEarnings.toLocaleString("en-IN")}
            {thisMonthEarnings >= lastMonthEarnings ? " · trending up" : " · trending down"} vs this month so far.
          </p>
        )}

        {/* Weekly bar breakdown */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-slate-800 mb-4">This Week</h2>
          <div className="flex items-end justify-between gap-2 h-32">
            {days.map((d) => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5">
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
            <h2 className="font-bold text-slate-800">Recent Transactions</h2>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No completed consultations yet.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {recent.map((a) => (
                <div key={a.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{patientLabel(a)}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(a.scheduledAt).toLocaleDateString("en-IN", { dateStyle: "medium" })} · {a.consultType} · {a.paymentMethod === "ONLINE" ? "Online" : "Cash"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-emerald-600">+₹{net(a).toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-slate-400">₹{a.amount} − ₹{a.platformFee} fee</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {visibleCount < recentAll.length && (
            <button
              onClick={() => setVisibleCount((v) => v + 10)}
              className="w-full py-3 border-t border-slate-100 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
            >
              Load {Math.min(10, recentAll.length - visibleCount)} more
            </button>
          )}
        </div>

        {/* Settlement history */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Settlement History</h2>
          </div>
          {settlements.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No settlements recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {settlements.map((s) => (
                <div key={s.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {new Date(s.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </p>
                    <p className="text-xs text-slate-400">{s.cashCount} cash · {s.onlineCount} online</p>
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
