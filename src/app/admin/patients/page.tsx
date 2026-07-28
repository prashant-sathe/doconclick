"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Search, Users, Eye, X, Phone, Mail, MapPin, Calendar,
  Activity, Droplets, Ruler, Weight, AlertTriangle,
  Pill, Scissors, PhoneCall, DollarSign, CalendarCheck,
  CheckCircle2, AlertCircle, MessageCircle, Clock, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────
interface PatientProfile {
  age: number;
  gender: string;
  location: string | null;
}

interface Patient {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  createdAt: string;
  patientProfile: PatientProfile | null;
  asPatient: { id: string; status: string }[];
}

interface Appointment {
  id: string;
  status: string;
  consultType: string;
  symptoms: string;
  amount: number;
  scheduledAt: string;
  doctor: { name: string; mobile: string; doctorProfile: { specialty: string } | null };
}

interface Complaint {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
}

interface PatientDetail extends Patient {
  asPatient: Appointment[];
  complaints: Complaint[];
  stats: { totalSpent: number; completedCount: number; scheduledCount: number; cancelledCount: number };
}

const APPT_BADGE: Record<string, string> = {
  COMPLETED: "badge badge-success",
  SCHEDULED: "badge badge-info",
  CANCELLED: "badge badge-danger",
};

const COMPLAINT_BADGE: Record<string, string> = {
  OPEN:        "badge badge-danger",
  IN_PROGRESS: "badge badge-warning",
  RESOLVED:    "badge badge-success",
};

// ── Patient Profile Drawer ─────────────────────────────────────
function PatientDrawer({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const [data, setData] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/patients/${patientId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [patientId]);

  const prof = data?.patientProfile;
  const s    = data?.stats;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-slide-in overflow-hidden">

        {/* Header */}
        <div className="px-6 py-6 flex items-start justify-between flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(213,94%,45%) 0%, hsl(172,76%,40%) 100%)" }}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white text-2xl font-extrabold border border-white/30">
              {data?.name?.charAt(0) ?? "P"}
            </div>
            <div>
              <div className="text-xl font-extrabold text-white">{data?.name ?? "Loading…"}</div>
              <div className="text-blue-100 text-sm mt-0.5">
                {prof ? `${prof.age} yrs · ${prof.gender}` : "Patient"}
              </div>
              {prof?.location && (
                <div className="text-blue-200 text-xs mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {prof.location}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
            </div>
          ) : (
            <div className="p-6 space-y-6">

              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Completed",  value: s?.completedCount ?? 0,  icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { label: "Scheduled",  value: s?.scheduledCount ?? 0,  icon: CalendarCheck, color: "text-blue-600",   bg: "bg-blue-50" },
                  { label: "Cancelled",  value: s?.cancelledCount ?? 0,  icon: AlertCircle,   color: "text-red-500",    bg: "bg-red-50" },
                  { label: "Total Spent", value: `₹${(s?.totalSpent ?? 0).toLocaleString("en-IN")}`, icon: DollarSign, color: "text-purple-600", bg: "bg-purple-50" },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                    <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                    <div className={`text-lg font-extrabold ${color}`}>{value}</div>
                    <div className="text-xs text-slate-500">{label}</div>
                  </div>
                ))}
              </div>

              {/* Contact */}
              <Section title="Contact Information" icon={Phone}>
                <Row icon={Phone}    label="Mobile"  value={data?.mobile ?? "—"} />
                <Row icon={Mail}     label="Email"   value={data?.email ?? "Not provided"} />
                <Row icon={Calendar} label="Joined"  value={data?.createdAt ? new Date(data.createdAt).toLocaleDateString("en-IN", { dateStyle: "long" }) : "—"} />
                {prof?.location && <Row icon={MapPin} label="Location" value={prof.location} />}
              </Section>

              {/* Basic Profile */}
              {prof && (
                <Section title="Patient Profile" icon={Activity}>
                  <Row icon={Calendar} label="Age"    value={`${prof.age} years`} />
                  <Row icon={Users}    label="Gender" value={prof.gender} />
                </Section>
              )}

              {/* Appointment History */}
              <Section title="Appointment History" icon={CalendarCheck}>
                {(data?.asPatient?.length ?? 0) === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-400 text-center">No appointments yet</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data?.asPatient.map((a) => (
                      <div key={a.id} className="flex items-center justify-between px-4 py-3 gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-800">
                            {a.doctor.name}
                            {a.doctor.doctorProfile?.specialty && (
                              <span className="text-slate-400 font-normal"> · {a.doctor.doctorProfile.specialty}</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">
                            {a.consultType} · {a.symptoms?.slice(0, 45)}
                          </div>
                          <div className="text-xs text-slate-300 mt-0.5">
                            {new Date(a.scheduledAt).toLocaleDateString("en-IN")}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={APPT_BADGE[a.status] ?? "badge badge-gray"}>{a.status}</span>
                          {a.amount > 0 && <span className="text-xs text-slate-400">₹{a.amount}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Complaints */}
              {(data?.complaints?.length ?? 0) > 0 && (
                <Section title="Complaints Filed" icon={MessageCircle}>
                  <div className="divide-y divide-slate-100">
                    {data?.complaints.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-4 py-3 gap-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{c.subject}</div>
                          <div className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString("en-IN")}</div>
                        </div>
                        <span className={COMPLAINT_BADGE[c.status] ?? "badge badge-gray"}>{c.status}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 bg-slate-50">
          <p className="text-xs text-slate-400 text-center">
            Patient ID: <span className="font-mono">{patientId.slice(0, 20)}…</span>
          </p>
        </div>
      </div>
    </>
  );
}

// ── Helper components ──────────────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h3>
      <div className="bg-slate-50 rounded-xl divide-y divide-slate-100 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <div className="flex items-center gap-2 text-slate-500 text-sm flex-shrink-0">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <span className="text-sm text-slate-800 text-right">{value}</span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function AdminPatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [viewId, setViewId]     = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/patients")
      .then((r) => r.json())
      .then((d) => { setPatients(d); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.mobile.includes(search)
  );

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Patient Management</h1>
          <p className="text-slate-500 text-sm mt-1">
            View all registered patients. Click <Eye className="inline w-3.5 h-3.5 text-blue-500" /> to see full profile.
          </p>
        </div>
        <button onClick={load} className="btn-ghost gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by name or mobile…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10" />
        </div>
      </div>

      {/* Table */}
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
                  <th>Mobile</th>
                  <th>Age / Gender</th>
                  <th>Location</th>
                  <th>Total Bookings</th>
                  <th>Joined</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No patients found.
                  </td></tr>
                ) : filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-400">{p.email ?? "No email"}</div>
                    </td>
                    <td className="font-mono text-xs">{p.mobile}</td>
                    <td>{p.patientProfile ? `${p.patientProfile.age} / ${p.patientProfile.gender}` : "—"}</td>
                    <td>{p.patientProfile?.location ?? "—"}</td>
                    <td>
                      <span className="badge badge-info">{p.asPatient.length} total</span>
                    </td>
                    <td className="text-xs text-slate-400">
                      {new Date(p.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td>
                      <button
                        onClick={() => setViewId(p.id)}
                        title="View Full Profile"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-3.5 border-t border-slate-100 text-xs text-slate-400">
          Showing {filtered.length} of {patients.length} patients
        </div>
      </div>

      {/* Drawer */}
      {viewId && (
        <PatientDrawer patientId={viewId} onClose={() => setViewId(null)} />
      )}
    </div>
  );
}
