"use client";
import Link from "next/link";
import { CalendarCheck, CheckCircle, Clock, XCircle, Stethoscope, Star } from "lucide-react";

const UPCOMING = [
  { name: "Alice Smith", time: "Today 10:30 AM", type: "VIDEO", symptoms: "Mild chest discomfort", status: "SCHEDULED" },
  { name: "Bob Johnson", time: "Today 1:00 PM", type: "HOME", symptoms: "Routine checkup", status: "SCHEDULED" },
  { name: "Charlie Brown", time: "Tomorrow 9:00 AM", type: "CLINIC", symptoms: "High blood pressure follow-up", status: "SCHEDULED" },
];

const STATUS_ICON: Record<string, React.ElementType> = {
  SCHEDULED: Clock,
  COMPLETED: CheckCircle,
  CANCELLED: XCircle,
};

export default function DoctorDashboard() {
  return (
    <div className="min-h-screen gradient-surface py-12 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center shadow-lg">
              <Stethoscope className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">Dr. John Doe</h1>
              <p className="text-slate-500 text-sm">Cardiologist · MBBS, MD · <span className="text-amber-500 font-semibold inline-flex items-center gap-0.5"><Star className="w-3.5 h-3.5 fill-current" /> 4.9</span></p>
            </div>
          </div>
          <Link href="/" className="btn-ghost text-sm">← Home</Link>
        </div>

        {/* Stat Strip */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Consultations", value: "142", color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Earnings This Month", value: "₹18,500", color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Avg. Rating", value: "4.9 / 5", color: "text-amber-600", bg: "bg-amber-50" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-2xl p-5`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-teal-500" />
            <h2 className="font-bold text-slate-800">Upcoming Appointments</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {UPCOMING.map((a, i) => {
              const Icon = STATUS_ICON[a.status];
              return (
                <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{a.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{a.time} · {a.type}</div>
                      <div className="text-sm text-slate-600 mt-0.5">{a.symptoms}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary py-1.5 px-3 text-xs">Reschedule</button>
                    <button className="btn-primary py-1.5 px-3 text-xs">Start Call</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          <p className="font-semibold mb-1">⏳ Account Under Review</p>
          <p>This is a preview of your dashboard. Your profile will be fully activated once our admin team verifies your credentials (usually within 24-48 hours).</p>
        </div>
      </div>
    </div>
  );
}
