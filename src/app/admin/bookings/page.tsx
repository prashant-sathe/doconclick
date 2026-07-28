"use client";
import { useEffect, useState } from "react";
import { Search, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Appointment {
  id: string;
  patient: { name: string };
  doctor: { name: string };
  symptoms: string;
  consultType: string;
  status: string;
  amount: number;
  platformFee: number;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "badge badge-info",
  COMPLETED: "badge badge-success",
  CANCELLED: "badge badge-danger",
};

const TYPE_BADGE: Record<string, string> = {
  HOME:   "badge badge-purple",
  VIDEO:  "badge badge-info",
  CLINIC: "badge badge-gray",
};

const FILTERS = ["ALL", "SCHEDULED", "COMPLETED", "CANCELLED"];

export default function AdminBookings() {
  const [bookings, setBookings] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/admin/bookings")
      .then((r) => r.json())
      .then((d) => { setBookings(d); setLoading(false); });
  }, []);

  const filtered = bookings
    .filter((b) => filter === "ALL" || b.status === filter)
    .filter((b) =>
      search === "" ||
      b.patient.name.toLowerCase().includes(search.toLowerCase()) ||
      b.doctor.name.toLowerCase().includes(search.toLowerCase())
    );

  const totals = { revenue: bookings.filter(b => b.status === "COMPLETED").reduce((s, b) => s + b.amount, 0), platform: bookings.filter(b => b.status === "COMPLETED").reduce((s, b) => s + b.platformFee, 0) };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Booking Management</h1>
          <p className="text-slate-500 text-sm mt-1">Overview of all consultations on the platform.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-center shadow-sm">
            <div className="text-xs text-slate-400">Gross Revenue</div>
            <div className="text-lg font-extrabold text-slate-900">₹{totals.revenue.toLocaleString()}</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-center shadow-sm">
            <div className="text-xs text-slate-400">Platform Earnings</div>
            <div className="text-lg font-extrabold text-emerald-600">₹{totals.platform.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by patient or doctor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-semibold border transition-all",
                filter === f
                  ? "bg-blue-600 text-white border-blue-600 shadow-md"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Type</th>
                  <th>Symptoms</th>
                  <th>Amount</th>
                  <th>Platform Fee</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400">
                    <CalendarCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No bookings found.
                  </td></tr>
                ) : filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="font-semibold text-slate-900">{b.patient.name}</td>
                    <td>{b.doctor.name}</td>
                    <td><span className={TYPE_BADGE[b.consultType] ?? "badge badge-gray"}>{b.consultType}</span></td>
                    <td className="max-w-[160px] truncate text-slate-600">{b.symptoms}</td>
                    <td className="font-semibold">₹{b.amount}</td>
                    <td className="text-emerald-600 font-semibold">₹{b.platformFee.toFixed(0)}</td>
                    <td><span className={STATUS_BADGE[b.status] ?? "badge badge-gray"}>{b.status}</span></td>
                    <td className="text-xs text-slate-400">{new Date(b.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-3.5 border-t border-slate-100 text-xs text-slate-400">
          Showing {filtered.length} of {bookings.length} bookings
        </div>
      </div>
    </div>
  );
}
