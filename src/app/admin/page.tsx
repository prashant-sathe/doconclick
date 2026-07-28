"use client";
import { useEffect, useState } from "react";
import { Users, Stethoscope, CalendarCheck, IndianRupee, AlertCircle, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Analytics {
  totalPatients: number;
  totalDoctors: number;
  totalAppointments: number;
  totalRevenue: number;
  totalPlatformFee: number;
  recentAppointments: {
    id: string;
    patient: { name: string };
    doctor: { name: string };
    symptoms: string;
    status: string;
    amount: number;
    createdAt: string;
  }[];
  pendingDoctors: number;
  openComplaints: number;
}

function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  delay?: number;
}) {
  return (
    <div className="stat-card animate-fade-in-up" style={{ animationDelay: `${delay}s`, opacity: 0 }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-extrabold text-slate-900">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", color)}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "badge badge-info",
  COMPLETED: "badge badge-success",
  CANCELLED: "badge badge-danger",
};

export default function AdminOverview() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <div className="skeleton h-8 w-48 mb-2" />
          <div className="skeleton h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Dashboard Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Welcome back, Admin. Here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
          <Clock className="w-4 h-4" />
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard icon={Users} label="Total Patients" value={data.totalPatients} sub="Registered users" color="bg-blue-50 text-blue-500" delay={0.05} />
        <StatCard icon={Stethoscope} label="Total Doctors" value={data.totalDoctors} sub={`${data.pendingDoctors} pending`} color="bg-teal-50 text-teal-500" delay={0.10} />
        <StatCard icon={CalendarCheck} label="Consultations" value={data.totalAppointments} sub="All time" color="bg-purple-50 text-purple-500" delay={0.15} />
        <StatCard icon={IndianRupee} label="Platform Revenue" value={`₹${data.totalPlatformFee.toLocaleString()}`} sub={`₹${data.totalRevenue.toLocaleString()} gross`} color="bg-emerald-50 text-emerald-500" delay={0.20} />
      </div>

      {/* Alert strips */}
      {(data.pendingDoctors > 0 || data.openComplaints > 0) && (
        <div className="flex flex-wrap gap-4 mb-8">
          {data.pendingDoctors > 0 && (
            <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-700 font-medium">
              <AlertCircle className="w-4 h-4" />
              {data.pendingDoctors} doctor{data.pendingDoctors > 1 ? "s" : ""} pending verification
              <a href="/admin/doctors" className="underline ml-1 hover:text-amber-800">Review →</a>
            </div>
          )}
          {data.openComplaints > 0 && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700 font-medium">
              <AlertCircle className="w-4 h-4" />
              {data.openComplaints} open complaint{data.openComplaints > 1 ? "s" : ""}
              <a href="/admin/complaints" className="underline ml-1 hover:text-red-800">View →</a>
            </div>
          )}
        </div>
      )}

      {/* Recent Appointments */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-fade-in-up" style={{ animationDelay: "0.25s", opacity: 0 }}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <h2 className="font-bold text-slate-800">Recent Appointments</h2>
          </div>
          <a href="/admin/bookings" className="text-xs font-semibold text-blue-600 hover:text-blue-700">View all →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Symptoms</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentAppointments.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No appointments yet.</td></tr>
              ) : data.recentAppointments.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium text-slate-900">{a.patient.name}</td>
                  <td>{a.doctor.name}</td>
                  <td className="max-w-[200px] truncate">{a.symptoms}</td>
                  <td className="font-semibold">₹{a.amount}</td>
                  <td><span className={STATUS_STYLES[a.status] ?? "badge badge-gray"}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
