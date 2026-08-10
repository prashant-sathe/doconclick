"use client";
import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle, XCircle, PauseCircle, Search, RefreshCw, Stethoscope,
  Eye, X, Phone, Mail, Award, Hash, Briefcase, DollarSign,
  Clock, MapPin, CreditCard, CalendarCheck, TrendingUp, AlertCircle,
  CheckCircle2, User, BadgeCheck, Languages, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────
interface DoctorProfile {
  specialty: string;
  qualification: string;
  languages: string;
  bio: string | null;
  registrationFeePaid: boolean;
  medRegNo: string;
  experience: number;
  consultFee: number;
  homeVisitFee: number;
  availability: string;
  radius: number;
  bankDetails: string;
  status: string;
  isVerified: boolean;
  medRegCertUrl: string | null;
  degreeCertUrl: string | null;
  kycDocUrl: string | null;
}

interface Doctor {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  createdAt: string;
  doctorProfile: DoctorProfile | null;
}

interface Appointment {
  id: string;
  status: string;
  consultType: string;
  symptoms: string;
  amount: number;
  scheduledAt: string;
  patient: { name: string; mobile: string };
}

interface DoctorDetail extends Doctor {
  asDoctor: Appointment[];
  stats: { totalEarnings: number; completedCount: number; scheduledCount: number; cancelledCount: number };
}

// ── Status config ──────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  PENDING:   "badge badge-warning",
  APPROVED:  "badge badge-success",
  REJECTED:  "badge badge-danger",
  SUSPENDED: "badge badge-gray",
};

const APPT_BADGE: Record<string, string> = {
  COMPLETED: "badge badge-success",
  SCHEDULED: "badge badge-info",
  CANCELLED: "badge badge-danger",
};

const FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"];

// ── Row in table ───────────────────────────────────────────────
function DoctorRow({
  d, updating, onStatus, onView,
}: {
  d: Doctor;
  updating: string | null;
  onStatus: (id: string, status: string) => void;
  onView: (d: Doctor) => void;
}) {
  return (
    <tr>
      <td>
        <div className="font-semibold text-slate-900">{d.name}</div>
        <div className="text-xs text-slate-400">{d.mobile}</div>
      </td>
      <td>{d.doctorProfile?.specialty ?? "—"}</td>
      <td className="font-mono text-xs">{d.doctorProfile?.medRegNo ?? "—"}</td>
      <td>{d.doctorProfile?.experience ?? "—"} yrs</td>
      <td>₹{d.doctorProfile?.consultFee ?? "—"}</td>
      <td>
        <span className={STATUS_BADGE[d.doctorProfile?.status ?? "PENDING"] ?? "badge badge-gray"}>
          {d.doctorProfile?.status ?? "PENDING"}
        </span>
      </td>
      <td>
        {d.doctorProfile?.isVerified ? (
          <span className="badge badge-success"><BadgeCheck className="w-3 h-3" /> Verified</span>
        ) : (
          <span className="badge badge-gray">Not Verified</span>
        )}
      </td>
      <td>
        <div className="flex items-center gap-1.5">
          {/* View */}
          <button
            onClick={() => onView(d)}
            title="View Profile"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
          {/* Approve */}
          {d.doctorProfile?.status !== "APPROVED" && (
            <button onClick={() => onStatus(d.id, "APPROVED")} disabled={updating === d.id}
              title="Approve"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40">
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
          {/* Reject */}
          {d.doctorProfile?.status !== "REJECTED" && (
            <button onClick={() => onStatus(d.id, "REJECTED")} disabled={updating === d.id}
              title="Reject"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
              <XCircle className="w-4 h-4" />
            </button>
          )}
          {/* Suspend */}
          {d.doctorProfile?.status !== "SUSPENDED" && (
            <button onClick={() => onStatus(d.id, "SUSPENDED")} disabled={updating === d.id}
              title="Suspend"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-amber-500 hover:bg-amber-50 transition-colors disabled:opacity-40">
              <PauseCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Profile Drawer ─────────────────────────────────────────────
function DoctorDrawer({
  doctorId,
  onClose,
  onStatusChange,
}: {
  doctorId: string;
  onClose: () => void;
  onStatusChange: () => void;
}) {
  const [data, setData] = useState<DoctorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  useEffect(() => {
    setLoading(true);
    setVerifyError("");
    fetch(`/api/admin/doctors/${doctorId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [doctorId]);

  const changeStatus = async (status: string) => {
    if (!data) return;
    setUpdating(true);
    await fetch(`/api/admin/doctors/${doctorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setUpdating(false);
    onStatusChange();
    // Refresh detail
    const res = await fetch(`/api/admin/doctors/${doctorId}`);
    setData(await res.json());
  };

  const toggleVerified = async () => {
    if (!data?.doctorProfile) return;
    const turningOn = !data.doctorProfile.isVerified;
    if (turningOn && !data.doctorProfile.registrationFeePaid) {
      setVerifyError("Doctor hasn't paid the ₹99 registration fee yet.");
      return;
    }
    setVerifyError("");
    setUpdating(true);
    const patchRes = await fetch(`/api/admin/doctors/${doctorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isVerified: turningOn }),
    });
    setUpdating(false);
    if (!patchRes.ok) {
      const body = await patchRes.json().catch(() => ({}));
      setVerifyError(body.error ?? "Could not update verification status.");
      return;
    }
    const res = await fetch(`/api/admin/doctors/${doctorId}`);
    setData(await res.json());
  };

  const p = data?.doctorProfile;
  const s = data?.stats;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-slide-in overflow-hidden">
        {/* Header */}
        <div className="gradient-hero px-6 py-6 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white text-2xl font-extrabold border border-white/30">
              {data?.name?.charAt(0) ?? "D"}
            </div>
            <div>
              <div className="text-xl font-extrabold text-white">{data?.name ?? "Loading…"}</div>
              <div className="text-blue-100 text-sm mt-0.5">{p?.specialty ?? ""} · {p?.qualification ?? ""}</div>
              {p && (
                <div className="mt-2 flex items-center gap-2">
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                    p.status === "APPROVED"  ? "bg-emerald-400 text-white" :
                    p.status === "PENDING"   ? "bg-amber-400 text-white" :
                    p.status === "SUSPENDED" ? "bg-slate-500 text-white" :
                                               "bg-red-400 text-white"
                  )}>
                    {p.status}
                  </span>
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                    p.registrationFeePaid ? "bg-emerald-400 text-white" : "bg-amber-400 text-white"
                  )}>
                    {p.registrationFeePaid ? "Fee Paid" : "Fee Unpaid"}
                  </span>
                  <button
                    onClick={toggleVerified}
                    disabled={updating || (!p.isVerified && !p.registrationFeePaid)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold transition-colors disabled:opacity-50",
                      p.isVerified ? "bg-white text-emerald-600" : "bg-white/10 text-white hover:bg-white/20"
                    )}
                    title={!p.isVerified && !p.registrationFeePaid ? "Doctor hasn't paid the registration fee yet" : "Toggle qualification verification"}
                  >
                    <BadgeCheck className="w-3.5 h-3.5" />
                    {p.isVerified ? "Verified" : "Mark Verified"}
                  </button>
                </div>
              )}
              {verifyError && (
                <p className="text-xs text-red-100 bg-red-500/30 rounded-lg px-2.5 py-1 mt-2">{verifyError}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
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
                  { label: "Scheduled",  value: s?.scheduledCount ?? 0,  icon: CalendarCheck, color: "text-blue-600",    bg: "bg-blue-50" },
                  { label: "Cancelled",  value: s?.cancelledCount ?? 0,  icon: AlertCircle,   color: "text-red-500",     bg: "bg-red-50" },
                  { label: "Earnings",   value: `₹${(s?.totalEarnings ?? 0).toLocaleString("en-IN")}`, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                    <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                    <div className={`text-lg font-extrabold ${color}`}>{value}</div>
                    <div className="text-xs text-slate-500">{label}</div>
                  </div>
                ))}
              </div>

              {p?.bio && (
                <Section title="About" icon={FileText}>
                  <p className="text-sm text-slate-600 leading-relaxed px-4 py-3">{p.bio}</p>
                </Section>
              )}

              {/* Contact */}
              <Section title="Contact Information" icon={User}>
                <Row icon={Phone} label="Mobile"  value={data?.mobile ?? "—"} />
                <Row icon={Mail}  label="Email"   value={data?.email ?? "Not provided"} />
                <Row icon={Award} label="Joined"  value={data?.createdAt ? new Date(data.createdAt).toLocaleDateString("en-IN", { dateStyle: "long" }) : "—"} />
              </Section>

              {/* Professional */}
              <Section title="Professional Details" icon={Stethoscope}>
                <Row icon={Award}      label="Qualification"    value={p?.qualification ?? "—"} />
                <Row icon={Languages}  label="Languages"        value={p?.languages ?? "—"} />
                <Row icon={Hash}       label="Reg. Number"      value={p?.medRegNo ?? "—"} mono />
                <Row icon={Briefcase}  label="Experience"       value={p ? `${p.experience} years` : "—"} />
                <Row icon={DollarSign} label="Clinic Fee"       value={p ? `₹${p.consultFee}` : "—"} />
                <Row icon={DollarSign} label="Home Visit Fee"   value={p ? `₹${p.homeVisitFee}` : "—"} />
                <Row icon={Clock}      label="Availability"     value={p?.availability ?? "—"} />
                <Row icon={MapPin}     label="Service Radius"   value={p ? `${p.radius} km` : "—"} />
              </Section>

              {/* Bank */}
              <Section title="Bank Details" icon={CreditCard}>
                <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700 font-mono">
                  {p?.bankDetails ?? "Not provided"}
                </div>
              </Section>

              {/* Verification Documents */}
              <Section title="Verification Documents" icon={BadgeCheck}>
                {[
                  { label: "Registration Certificate", url: p?.medRegCertUrl },
                  { label: "Medical Degree Certificate", url: p?.degreeCertUrl },
                  { label: "Government ID (KYC)", url: p?.kycDocUrl },
                ].map(({ label, url }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 gap-4">
                    <span className="text-sm text-slate-500">{label}</span>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 font-semibold hover:underline">
                        View document →
                      </a>
                    ) : (
                      <span className="text-sm text-slate-300">Not uploaded</span>
                    )}
                  </div>
                ))}
              </Section>

              {/* Recent Appointments */}
              <Section title="Recent Appointments" icon={CalendarCheck}>
                {(data?.asDoctor?.length ?? 0) === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No appointments yet</p>
                ) : (
                  <div className="space-y-2">
                    {data?.asDoctor.map((a) => (
                      <div key={a.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{a.patient.name}</div>
                          <div className="text-xs text-slate-400">{a.consultType} · {a.symptoms?.slice(0, 40)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={APPT_BADGE[a.status] ?? "badge badge-gray"}>{a.status}</span>
                          <span className="text-xs text-slate-400">₹{a.amount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

            </div>
          )}
        </div>

        {/* Footer actions */}
        {p && !loading && (
          <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 bg-white">
            <div className="flex gap-2">
              {p.status !== "APPROVED" && (
                <button onClick={() => changeStatus("APPROVED")} disabled={updating} className="btn-success flex-1 justify-center py-2.5 text-sm">
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
              )}
              {p.status !== "SUSPENDED" && (
                <button onClick={() => changeStatus("SUSPENDED")} disabled={updating} className="btn-secondary flex-1 justify-center py-2.5 text-sm text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100">
                  <PauseCircle className="w-4 h-4" /> Suspend
                </button>
              )}
              {p.status !== "REJECTED" && (
                <button onClick={() => changeStatus("REJECTED")} disabled={updating} className="btn-danger flex-1 justify-center py-2.5 text-sm">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Helper sub-components ──────────────────────────────────────
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

function Row({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <div className="flex items-center gap-2 text-slate-500 text-sm flex-shrink-0">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <span className={cn("text-sm text-slate-800 text-right", mono && "font-mono")}>{value}</span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function AdminDoctors() {
  const [doctors, setDoctors]   = useState<Doctor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState("ALL");
  const [updating, setUpdating] = useState<string | null>(null);
  const [viewId, setViewId]     = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/doctors")
      .then((r) => r.json())
      .then((d) => { setDoctors(d); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (doctorId: string, status: string) => {
    setUpdating(doctorId);
    await fetch(`/api/admin/doctors/${doctorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
    setUpdating(null);
  };

  const filtered = doctors
    .filter((d) => filter === "ALL" || d.doctorProfile?.status === filter)
    .filter((d) =>
      search === "" ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.doctorProfile?.medRegNo.toLowerCase().includes(search.toLowerCase()) ||
      d.doctorProfile?.specialty.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Doctor Management</h1>
          <p className="text-slate-500 text-sm mt-1">Verify credentials, approve or suspend doctors. Click <Eye className="inline w-3.5 h-3.5 text-blue-500" /> to view full profile.</p>
        </div>
        <button onClick={load} className="btn-ghost gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Filters + Search */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by name, Reg. No or specialty…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="input-field pl-10" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-4 py-2 rounded-xl text-xs font-semibold border transition-all",
                filter === f ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              )}>
              {f}
            </button>
          ))}
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
                  <th>Doctor</th>
                  <th>Specialty</th>
                  <th>Reg. No.</th>
                  <th>Experience</th>
                  <th>Fee (₹)</th>
                  <th>Status</th>
                  <th>Verified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400">
                    <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No doctors found.
                  </td></tr>
                ) : filtered.map((d) => (
                  <DoctorRow key={d.id} d={d} updating={updating}
                    onStatus={updateStatus}
                    onView={(doc) => setViewId(doc.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-3.5 border-t border-slate-100 text-xs text-slate-400">
          Showing {filtered.length} of {doctors.length} doctors
        </div>
      </div>

      {/* Drawer */}
      {viewId && (
        <DoctorDrawer
          doctorId={viewId}
          onClose={() => setViewId(null)}
          onStatusChange={load}
        />
      )}
    </div>
  );
}
