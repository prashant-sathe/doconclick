"use client";
import { useState, useMemo } from "react";
import Image from "next/image";
import {
  Search, Users, Eye, X, Phone, Mail, MapPin, Calendar,
  Activity, Droplets, Ruler, Weight, AlertTriangle,
  Pill, Scissors, PhoneCall, DollarSign, CalendarCheck,
  CheckCircle2, AlertCircle, MessageCircle, Clock, RefreshCw, Trash2, LogIn, UserX,
} from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { cn, formatProviderName } from "@/lib/utils";
import { brandGridTheme } from "@/lib/agGridTheme";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAccountImpact } from "@/components/admin/AccountImpactDialog";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import { mutate, useLoad } from "@/lib/apiClient";

// ── Types ──────────────────────────────────────────────────────
interface PatientProfile {
  age: number;
  gender: string;
  location: string | null;
  photoUrl: string | null;
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
  providerType?: string;
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
  // Over all of the patient's appointments; spend is what they paid for
  // completed visits (fee minus coupon discount).
  stats: {
    totalSpent: number; couponSavings: number; totalCount: number;
    completedCount: number; scheduledCount: number; pendingCount: number; cancelledCount: number; noShowCount: number;
  };
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
  const { data, error, loading, reloading, reload } = useLoad<PatientDetail>(`/api/admin/patients/${patientId}`, { fallback: "Couldn't load this patient." });

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
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white text-2xl font-extrabold border border-white/30 overflow-hidden">
              {prof?.photoUrl ? (
                <Image src={prof.photoUrl} alt={data?.name || "Patient"} width={64} height={64} className="w-full h-full object-cover" />
              ) : (
                data?.name?.charAt(0) || "P"
              )}
            </div>
            <div>
              <div className="text-xl font-extrabold text-white">{data ? (data.name || "Name not added") : loading ? "Loading…" : "Patient"}</div>
              <div className="text-blue-100 text-sm mt-0.5">
                {prof && prof.age > 0 && prof.gender ? `${prof.age} yrs · ${prof.gender}` : "Patient"}
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
          ) : !data ? (
            <div className="p-6">
              {error && <LoadError error={error} onRetry={reload} retrying={reloading} />}
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {error && <LoadError error={error} onRetry={reload} retrying={reloading} hasData />}

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: "Completed",  value: s?.completedCount ?? 0,  icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { label: "Scheduled",  value: s?.scheduledCount ?? 0,  icon: CalendarCheck, color: "text-blue-600",   bg: "bg-blue-50" },
                  { label: "Cancelled",  value: s?.cancelledCount ?? 0,  icon: AlertCircle,   color: "text-red-500",    bg: "bg-red-50" },
                  { label: "No-Show",    value: s?.noShowCount ?? 0,     icon: UserX,         color: "text-amber-600",  bg: "bg-amber-50" },
                  { label: "Total Spent", value: `₹${(s?.totalSpent ?? 0).toLocaleString("en-IN")}`, icon: DollarSign, color: "text-purple-600", bg: "bg-purple-50" },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                    <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                    <div className={`text-lg font-extrabold ${color}`}>{value}</div>
                    <div className="text-xs text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
              {s && (
                <p className="text-xs text-slate-500 -mt-3">
                  Paid for {s.completedCount} completed visit{s.completedCount === 1 ? "" : "s"}
                  {s.couponSavings > 0 ? ` after ₹${s.couponSavings.toLocaleString("en-IN")} in coupon discounts` : ""}.
                  {" "}{s.totalCount} appointment{s.totalCount === 1 ? "" : "s"} in total{s.pendingCount > 0 ? `, ${s.pendingCount} awaiting a response` : ""}.
                </p>
              )}

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
                  <Row icon={Calendar} label="Age"    value={prof.age > 0 ? `${prof.age} years` : "Not added"} />
                  <Row icon={Users}    label="Gender" value={prof.gender || "Not added"} />
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
                            {formatProviderName(a.doctor.name, a.providerType)}
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
  const { data, error: loadError, loading, reloading, reload } = useLoad<Patient[]>("/api/admin/patients", { fallback: "Couldn't load patients." });
  const patients = data ?? [];
  const [search, setSearch]     = useState("");
  const [viewId, setViewId]     = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<Patient | null>(null);
  const [deleteNotice, setDeleteNotice] = useState("");
  const impact = useAccountImpact();
  const toast = useToast();

  // A patient with upcoming bookings or wallet money goes through the impact
  // step first (see useAccountImpact) — the admin sees what will be cancelled
  // and what's left in the wallet to pay out by hand.
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteNotice("");
    setDeleting(true);
    setDeleteTarget(null);
    const body = await impact.run(
      (extra) => fetch(`/api/admin/patients/${target.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(extra),
      }),
      { title: `Before deleting ${target.name || "this patient"}`, actionLabel: "Delete Account" },
    );
    setDeleting(false);
    if (body) {
      const bookings = body.bookings as { cancelled: number; refundTotal: number } | undefined;
      const wallet = Number(body.walletBalance ?? 0);
      setDeleteNotice(
        `${target.name || "Patient"} deleted.`
          + (bookings?.cancelled ? ` ${bookings.cancelled} booking${bookings.cancelled === 1 ? "" : "s"} cancelled and the providers notified.` : "")
          + (wallet > 0 ? ` ₹${wallet} is left in their wallet — pay it out manually.` : "")
      );
    }
    await reload();
  };

  // Resolves false on failure (toasted) so the confirm dialog stays open to retry.
  const impersonate = async (patient: Patient) => {
    setImpersonatingId(patient.id);
    const res = await mutate(`/api/admin/impersonate/${patient.id}`, { method: "POST", fallback: "Could not log in as this patient." });
    if (!res.ok) {
      toast.error(res.error);
      setImpersonatingId(null);
      return false;
    }
    window.location.href = "/patient/dashboard";
    return true;
  };

  const filtered = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.mobile.includes(search)
  );

  const columnDefs = useMemo<ColDef<Patient>[]>(() => [
    {
      headerName: "Patient",
      field: "name",
      minWidth: 190,
      flex: 1.2,
      cellRenderer: (p: ICellRendererParams<Patient>) => (
        <div className="leading-tight py-1">
          <div className="font-semibold text-slate-900">{p.data?.name || <span className="text-slate-400 font-normal italic">Name not added</span>}</div>
          <div className="text-xs text-slate-400">{p.data?.email ?? "No email"}</div>
        </div>
      ),
    },
    { headerName: "Mobile", field: "mobile", width: 140, cellClass: "font-mono text-xs" },
    {
      headerName: "Age / Gender",
      field: "patientProfile.age",
      width: 140,
      valueGetter: (p) => (p.data?.patientProfile ? `${p.data.patientProfile.age} / ${p.data.patientProfile.gender}` : "—"),
    },
    {
      headerName: "Location",
      field: "patientProfile.location",
      minWidth: 140,
      flex: 1,
      valueFormatter: (p: ValueFormatterParams<Patient>) => p.value ?? "—",
    },
    {
      headerName: "Total Bookings",
      field: "asPatient",
      width: 150,
      valueGetter: (p) => p.data?.asPatient.length ?? 0,
      cellRenderer: (p: ICellRendererParams<Patient>) => (
        <span className="badge badge-info">{p.value} total</span>
      ),
    },
    {
      headerName: "Joined",
      field: "createdAt",
      width: 120,
      valueGetter: (p) => (p.data ? new Date(p.data.createdAt) : null),
      valueFormatter: (p) => (p.value instanceof Date ? p.value.toLocaleDateString("en-IN") : ""),
      cellClass: "text-xs text-slate-400",
    },
    {
      headerName: "Actions",
      field: "id",
      width: 120,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<Patient>) => {
        const patient = p.data;
        if (!patient) return null;
        return (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewId(patient.id)}
              title="View Full Profile"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => setImpersonateTarget(patient)}
              disabled={impersonatingId === patient.id}
              title="Log in as this patient"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-indigo-500 hover:bg-indigo-50 transition-colors disabled:opacity-40"
            >
              <LogIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeleteTarget(patient)}
              title="Delete Account"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ], [impersonatingId]);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, filter: true }), []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Patient Management</h1>
          <p className="text-slate-500 text-sm mt-1">
            View all registered patients. Click <Eye className="inline w-3.5 h-3.5 text-blue-500" /> to see full profile.
          </p>
        </div>
        <button onClick={reload} disabled={reloading} className="btn-ghost gap-2">
          <RefreshCw className={cn("w-4 h-4", reloading && "animate-spin")} /> Refresh
        </button>
      </div>

      {loadError && data && <LoadError error={loadError} onRetry={reload} retrying={reloading} hasData />}
      {impact.error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {impact.error}
        </div>
      )}
      {deleteNotice && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">
          {deleteNotice}
        </div>
      )}

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
          <div className="p-4 sm:p-6 lg:p-8 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : !data ? (
          loadError && <LoadError error={loadError} onRetry={reload} retrying={reloading} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No patients found.
          </div>
        ) : (
          <AgGridReact<Patient>
            theme={brandGridTheme}
            rowData={filtered}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            domLayout="autoHeight"
            pagination
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 20, 50, 100]}
            animateRows
          />
        )}
      </div>

      {/* Drawer */}
      {viewId && (
        <PatientDrawer patientId={viewId} onClose={() => setViewId(null)} />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          icon={Trash2}
          title="Delete this account?"
          message={
            <>
              {deleteTarget.name || "This patient"} ({deleteTarget.mobile}) will be permanently blocked from logging in, and their mobile number will be freed for a new registration.
              Their past appointment history is kept for the doctors who treated them. This cannot be undone.
            </>
          }
          confirmLabel="Delete Account"
          busyLabel="Deleting…"
          tone="danger"
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {impact.dialog}

      {/* Impersonate confirmation */}
      {impersonateTarget && (
        <ConfirmDialog
          icon={LogIn}
          title={`Log in as ${impersonateTarget.name || impersonateTarget.mobile}?`}
          message="You'll be switched into their account and see the app exactly as they do. Use “Exit impersonation” in the banner to return to your admin session."
          confirmLabel="Log In"
          busyLabel="Logging in…"
          tone="primary"
          busy={impersonatingId === impersonateTarget.id}
          onCancel={() => setImpersonateTarget(null)}
          onConfirm={async () => {
            if (await impersonate(impersonateTarget)) setImpersonateTarget(null);
          }}
        />
      )}
    </div>
  );
}
