"use client";
import { useMemo, useState } from "react";
import { Search, CalendarCheck, Eye, X, FileText, Pill, FlaskConical, Phone, Download, ShieldAlert, Wallet } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { cn, formatProviderName, nameOrMobile } from "@/lib/utils";
import { brandGridTheme } from "@/lib/agGridTheme";
import PrescriptionDownloadButton from "@/components/patient/PrescriptionDownloadButton";
import ReceiptDownloadButton from "@/components/patient/ReceiptDownloadButton";
import LoadError from "@/components/LoadError";
import { useLoad, mutate } from "@/lib/apiClient";
import { BOOKING_ACTION_REASON_MIN, BOOKING_ACTION_REASON_MAX } from "@/lib/adminBookingActions";

interface Appointment {
  id: string;
  patient: { name: string; mobile: string };
  providerType?: string;
  doctor: { name: string };
  symptoms: string;
  patientName: string | null;
  relation: string;
  consultType: string;
  status: string;
  amount: number;
  platformFee: number;
  createdAt: string;
}

interface Medicine {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
}

interface Test {
  id: string;
  name: string;
  instructions: string | null;
}

interface Attachment {
  id: string;
  url: string;
  fileName: string | null;
  createdAt: string;
}

interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number | null;
  status: string;
  note: string | null;
  createdAt: string;
  admin: { name: string } | null;
}

interface AppointmentDetail extends Appointment {
  id: string;
  serviceName?: string | null;
  packageIndex?: number | null;
  visitStartedAt?: string | null;
  visitStartNote?: string | null;
  patientId: string;
  scheduledAt: string;
  doctor: {
    name: string; mobile: string;
    doctorProfile: { specialty: string; qualification: string | null; medRegNo: string | null; clinicName: string | null; signatureUrl: string | null } | null;
  };
  patient: {
    name: string; mobile: string; email: string | null;
    patientProfile: { age: number; gender: string; homeAddress: string | null } | null;
  };
  paymentStatus: string;
  doctorNotes: string | null;
  prescriptionUrl: string | null;
  medicines: Medicine[];
  tests: Test[];
  attachments: Attachment[];
  bookedById: string | null;
  paymentMethod: string;
  cashfreePaymentId: string | null;
  adminActionReason: string | null;
  adminActionAt: string | null;
  adminActionByName: string | null;
  reassignedTo: { id: string; status: string; doctor: { name: string } } | null;
  ledger: LedgerRow[];
}

// Money into the patient's wallet vs out of it, for the ledger list.
const LEDGER_LABEL: Record<string, string> = {
  BOOKING_PAYMENT: "Paid from wallet",
  CANCELLATION_REFUND: "Refunded to wallet",
  REASSIGNMENT_CREDIT: "Credited to wallet (reassigned)",
};

type BookingAction = "CANCEL" | "REASSIGN" | "NO_SHOW";
const ACTION_COPY: Record<BookingAction, { label: string; confirm: string; hint: string }> = {
  CANCEL: {
    label: "Cancel + refund",
    confirm: "Cancel booking",
    hint: "Cancels the booking. Anything the patient paid goes back to their DocOnClick wallet (never to the card/UPI). Patient and provider are notified.",
  },
  REASSIGN: {
    label: "Reassign",
    confirm: "Reassign booking",
    hint: "Cancels this booking and sends the patient's request to the nearest free doctor of the same specialty. Any payment is credited to the wallet. If nobody is free, it's just cancelled and refunded.",
  },
  NO_SHOW: {
    label: "Mark no-show",
    confirm: "Mark no-show",
    hint: "Marks that the patient didn't turn up. No refund, and the provider isn't paid for it. Only after the booking time has passed.",
  },
};

// Cancel / reassign / no-show with a required reason — the server re-checks
// everything and refunds at most once, so a stale drawer just gets a 409.
function BookingActions({ data, onDone }: { data: AppointmentDetail; onDone: () => void }) {
  const [action, setAction] = useState<BookingAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());

  const live = data.status === "PENDING_APPROVAL" || data.status === "SCHEDULED";
  if (!live && !done) return null;
  const timePassed = new Date(data.scheduledAt).getTime() <= openedAt;
  const available: BookingAction[] = [
    "CANCEL",
    ...(data.providerType !== "NURSE" && !data.bookedById ? ["REASSIGN" as const] : []),
    ...(data.status === "SCHEDULED" && timePassed ? ["NO_SHOW" as const] : []),
  ];
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= BOOKING_ACTION_REASON_MIN && trimmed.length <= BOOKING_ACTION_REASON_MAX;

  async function submit() {
    if (!action || !reasonOk || busy) return;
    setBusy(true);
    setError(null);
    const res = await mutate<{ status: string; refund: number; reassignedTo: { doctorName: string } | null }>(
      `/api/admin/bookings/${data.id}/action`,
      { body: { action, reason: trimmed }, fallback: "Couldn't update this booking." },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (res.status === 409) onDone(); // it changed under us — show the latest
      return;
    }
    const r = res.data;
    setDone(
      r.status === "NO_SHOW" ? "Marked as a no-show."
        : r.reassignedTo ? `Reassigned to ${formatProviderName(r.reassignedTo.doctorName)}.${r.refund > 0 ? ` ₹${r.refund} credited to the patient's wallet.` : ""}`
          : `Cancelled.${r.refund > 0 ? ` ₹${r.refund} refunded to the patient's wallet.` : ""}${action === "REASSIGN" ? " No other doctor was free." : ""}`
    );
    setAction(null);
    setReason("");
    onDone();
  }

  return (
    <Section title="Admin actions" icon={ShieldAlert}>
      <div className="p-4 space-y-3">
        {done && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{done}</div>}
        {live && (
          <div className="flex flex-wrap gap-2">
            {available.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => { setAction(a); setError(null); setDone(null); }}
                className={cn(
                  "px-3 py-2 rounded-xl text-xs font-semibold border transition-all",
                  action === a
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                )}
              >
                {ACTION_COPY[a].label}
              </button>
            ))}
          </div>
        )}
        {live && action && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{ACTION_COPY[action].hint}</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={BOOKING_ACTION_REASON_MAX}
              rows={3}
              placeholder="Reason (kept on the audit trail, not shown to the patient or provider)"
              className="input-field w-full"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-slate-400">{trimmed.length}/{BOOKING_ACTION_REASON_MAX} · at least {BOOKING_ACTION_REASON_MIN}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setAction(null); setError(null); }}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600">
                  Back
                </button>
                <button type="button" onClick={submit} disabled={!reasonOk || busy}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 text-white disabled:opacity-50">
                  {busy ? "Working…" : ACTION_COPY[action].confirm}
                </button>
              </div>
            </div>
          </div>
        )}
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
      </div>
    </Section>
  );
}

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "badge badge-info",
  COMPLETED: "badge badge-success",
  CANCELLED: "badge badge-danger",
  NO_SHOW: "badge badge-warning",
};

const TYPE_BADGE: Record<string, string> = {
  HOME:   "badge badge-purple",
  VIDEO:  "badge badge-info",
  CLINIC: "badge badge-gray",
};

const FILTERS = ["ALL", "SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"];

function downloadUrl(fileUrl: string, name: string) {
  return `/api/files/download?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(name)}`;
}

// ── Booking Detail Drawer ────────────────────────────────────────
function BookingDrawer({ bookingId, onClose, onChanged }: { bookingId: string; onClose: () => void; onChanged: () => void }) {
  const { data, error, loading, reloading, reload } = useLoad<AppointmentDetail>(`/api/admin/bookings/${bookingId}`, { fallback: "Couldn't load this booking." });

  const hasDocuments = (data?.attachments.length ?? 0) > 0 || !!data?.prescriptionUrl;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-slide-in overflow-hidden">

        {/* Header */}
        <div className="px-6 py-6 flex items-start justify-between flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(213,94%,45%) 0%, hsl(172,76%,40%) 100%)" }}>
          <div>
            <div className="text-xl font-extrabold text-white">
              {data && (data.relation !== "Self" && data.patientName ? data.patientName : nameOrMobile(data.patient.name, data.patient.mobile))}
            </div>
            <div className="text-blue-100 text-sm mt-0.5">
              {data ? `with ${formatProviderName(data.doctor.name, data.providerType)}` : loading ? "Loading…" : "Booking"}
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

              {/* Summary */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={STATUS_BADGE[data.status] ?? "badge badge-gray"}>{data.status}</span>
                <span className={TYPE_BADGE[data.consultType] ?? "badge badge-gray"}>{data.consultType}</span>
                <span className="text-sm text-slate-500">₹{data.amount}</span>
                <span className="text-xs text-slate-400">{new Date(data.createdAt).toLocaleDateString("en-IN")}</span>
                {data.paymentStatus === "PAID" && <span className="ml-auto"><ReceiptDownloadButton kind="appointment" id={data.id} compact /></span>}
              </div>

              <BookingActions data={data} onDone={() => { reload(); onChanged(); }} />

              {data.adminActionAt && (
                <Section title="Admin action" icon={ShieldAlert}>
                  <Row label="By" value={data.adminActionByName ?? "—"} />
                  <Row label="When" value={new Date(data.adminActionAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} />
                  <Row label="Reason" value={data.adminActionReason ?? "—"} />
                  {data.reassignedTo && (
                    <Row label="Reassigned to" value={`${formatProviderName(data.reassignedTo.doctor.name)} · ${data.reassignedTo.status}`} />
                  )}
                </Section>
              )}

              <Section title="Patient" icon={Phone}>
                <Row label="Name" value={data.relation !== "Self" && data.patientName ? `${data.patientName} (${data.relation} of ${nameOrMobile(data.patient.name, data.patient.mobile)})` : nameOrMobile(data.patient.name, data.patient.mobile)} />
                <Row label="Mobile" value={data.patient.mobile} />
                <Row label="Symptoms" value={data.symptoms || "—"} />
              </Section>

              <Section title="Doctor" icon={Phone}>
                <Row label="Name" value={formatProviderName(data.doctor.name, data.providerType)} />
                {data.providerType === "NURSE" ? (
                  <>
                    <Row label="Service" value={`${data.serviceName ?? "—"}${data.packageIndex ? ` (package visit ${data.packageIndex})` : ""}`} />
                    <Row
                      label="Visit start"
                      value={!data.visitStartedAt ? "Not started"
                        : data.visitStartNote ? `⚠ Started WITHOUT patient code — "${data.visitStartNote}"`
                          : `Verified with patient code · ${new Date(data.visitStartedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`}
                    />
                  </>
                ) : (
                  <Row label="Specialty" value={data.doctor.doctorProfile?.specialty ?? "—"} />
                )}
                <Row label="Mobile" value={data.doctor.mobile} />
              </Section>

              <Section title="Wallet ledger for this booking" icon={Wallet}>
                <Row
                  label="Payment"
                  value={`${data.paymentStatus} · ${data.paymentMethod}${data.cashfreePaymentId ? ` · gateway ${data.cashfreePaymentId}` : ""}`}
                />
                {data.ledger.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-slate-400 text-center">No wallet payments or refunds for this booking</div>
                ) : data.ledger.map((t) => (
                  <div key={t.id} className="flex items-start justify-between px-4 py-3 gap-4">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800">{LEDGER_LABEL[t.type] ?? t.type}{t.status !== "SUCCESS" ? ` · ${t.status}` : ""}</div>
                      <div className="text-xs text-slate-400 break-words">
                        {new Date(t.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        {t.admin && ` · by ${t.admin.name}`}
                        {t.note && ` · ${t.note}`}
                      </div>
                    </div>
                    <span className={cn("text-sm font-semibold flex-shrink-0", t.type === "BOOKING_PAYMENT" ? "text-slate-700" : "text-emerald-600")}>
                      {t.type === "BOOKING_PAYMENT" ? "−" : "+"}₹{t.amount}
                    </span>
                  </div>
                ))}
              </Section>

              {/* Documents / Reports / Prescription */}
              <Section title="Documents & Prescription" icon={FileText}>
                {!hasDocuments && data.medicines.length === 0 && data.tests.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-400 text-center">No documents uploaded for this booking</div>
                ) : (
                  <div className="p-4 space-y-4">
                    {(data.medicines.length > 0 || data.tests.length > 0) && (
                      <PrescriptionDownloadButton appointmentId={data.id} patientId={data.patientId} />
                    )}
                    {data.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {data.attachments.map((att, i) => {
                          const name = att.fileName ?? `attachment-${i + 1}`;
                          return (
                            <a key={att.id} href={downloadUrl(att.url, name)}
                               className="inline-flex items-center gap-1 text-xs text-teal-600 bg-teal-50 border border-teal-100 rounded-lg px-2 py-1 hover:bg-teal-100">
                              <Download className="w-3 h-3" /> {name}
                            </a>
                          );
                        })}
                      </div>
                    )}
                    {data.prescriptionUrl && (
                      <a href={downloadUrl(data.prescriptionUrl, "prescription.pdf")}
                         className="inline-flex items-center gap-1 text-xs text-teal-600 bg-teal-50 border border-teal-100 rounded-lg px-2 py-1 hover:bg-teal-100">
                        <Download className="w-3 h-3" /> Prescription (legacy)
                      </a>
                    )}
                    {data.medicines.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
                          <Pill className="w-3.5 h-3.5" /> Prescribed Medicines
                        </div>
                        <div className="space-y-1.5">
                          {data.medicines.map((m) => (
                            <div key={m.id} className="text-sm text-slate-700 bg-white rounded-lg border border-slate-100 px-3 py-2">
                              <span className="font-semibold">{m.name}</span> — {m.dosage}, {m.frequency}, {m.duration}
                              {m.instructions && <div className="text-xs text-slate-400 mt-0.5">{m.instructions}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {data.tests.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
                          <FlaskConical className="w-3.5 h-3.5" /> Recommended Tests
                        </div>
                        <div className="space-y-1.5">
                          {data.tests.map((t) => (
                            <div key={t.id} className="text-sm text-slate-700 bg-white rounded-lg border border-slate-100 px-3 py-2">
                              <span className="font-semibold">{t.name}</span>
                              {t.instructions && <div className="text-xs text-slate-400 mt-0.5">{t.instructions}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {data.doctorNotes && (
                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-1">Doctor&apos;s Notes</div>
                        <div className="text-sm text-slate-700">{data.doctorNotes}</div>
                      </div>
                    )}
                  </div>
                )}
              </Section>

            </div>
          )}
        </div>
      </div>
    </>
  );
}

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between px-4 py-3 gap-4">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-800 text-right">{value}</span>
    </div>
  );
}

export default function AdminBookings() {
  const { data, error, loading, reloading, reload } = useLoad<Appointment[]>("/api/admin/bookings", { fallback: "Couldn't load bookings." });
  const bookings = data ?? [];
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [viewId, setViewId] = useState<string | null>(null);

  const filtered = bookings
    .filter((b) => filter === "ALL" || b.status === filter)
    .filter((b) =>
      search === "" ||
      b.patient.name.toLowerCase().includes(search.toLowerCase()) ||
      b.patient.mobile.includes(search.trim()) ||
      (b.patientName?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      b.doctor.name.toLowerCase().includes(search.toLowerCase())
    );

  const totals = { revenue: bookings.filter(b => b.status === "COMPLETED").reduce((s, b) => s + b.amount, 0), platform: bookings.filter(b => b.status === "COMPLETED").reduce((s, b) => s + b.platformFee, 0) };

  const columnDefs = useMemo<ColDef<Appointment>[]>(() => [
    {
      headerName: "Patient",
      field: "patient.name",
      minWidth: 190,
      flex: 1.2,
      cellRenderer: (p: ICellRendererParams<Appointment>) => {
        const b = p.data;
        if (!b) return null;
        const name = b.relation !== "Self" && b.patientName ? b.patientName : nameOrMobile(b.patient.name, b.patient.mobile);
        return (
          <div className="leading-tight py-1">
            <div className="font-semibold text-slate-900">{name}</div>
            {b.relation !== "Self" && (
              <div className="text-xs font-normal text-slate-400">{b.relation} of {nameOrMobile(b.patient.name, b.patient.mobile)}</div>
            )}
          </div>
        );
      },
    },
    {
      headerName: "Doctor",
      field: "doctor.name",
      minWidth: 170,
      flex: 1.2,
      valueFormatter: (p: ValueFormatterParams<Appointment>) => formatProviderName(p.value ?? "", p.data?.providerType),
    },
    {
      headerName: "Type",
      field: "consultType",
      width: 110,
      cellRenderer: (p: ICellRendererParams<Appointment>) => (
        <span className={TYPE_BADGE[p.value as string] ?? "badge badge-gray"}>{p.value}</span>
      ),
    },
    {
      headerName: "Symptoms",
      field: "symptoms",
      minWidth: 160,
      flex: 1.2,
      tooltipField: "symptoms",
      cellClass: "truncate text-slate-600",
    },
    {
      headerName: "Amount",
      field: "amount",
      width: 110,
      valueFormatter: (p: ValueFormatterParams<Appointment>) => `₹${p.value}`,
      cellClass: "font-semibold",
    },
    {
      headerName: "Platform Fee",
      field: "platformFee",
      width: 150,
      valueFormatter: (p: ValueFormatterParams<Appointment>) => `₹${(p.value ?? 0).toFixed(0)}`,
      cellClass: "text-emerald-600 font-semibold",
    },
    {
      headerName: "Status",
      field: "status",
      width: 175,
      cellRenderer: (p: ICellRendererParams<Appointment>) => (
        <span className={STATUS_BADGE[p.value as string] ?? "badge badge-gray"}>{p.value}</span>
      ),
    },
    {
      headerName: "Date",
      field: "createdAt",
      width: 120,
      valueGetter: (p) => (p.data ? new Date(p.data.createdAt) : null),
      valueFormatter: (p) => (p.value instanceof Date ? p.value.toLocaleDateString("en-IN") : ""),
      cellClass: "text-xs text-slate-400",
      sort: "desc",
    },
    {
      headerName: "Actions",
      field: "id",
      width: 90,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<Appointment>) => (
        <button
          onClick={() => p.data && setViewId(p.data.id)}
          title="View Booking / Documents"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
  }), []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Booking Management</h1>
          <p className="text-slate-500 text-sm mt-1">
            Overview of all consultations on the platform. Click <Eye className="inline w-3.5 h-3.5 text-blue-500" /> to view documents, reports & prescription.
          </p>
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

      {error && data && <LoadError error={error} onRetry={reload} retrying={reloading} hasData />}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4 sm:p-6 lg:p-8 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : !data ? (
          error && <LoadError error={error} onRetry={reload} retrying={reloading} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <CalendarCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No bookings found.
          </div>
        ) : (
          <AgGridReact<Appointment>
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

      {viewId && (
        <BookingDrawer bookingId={viewId} onClose={() => setViewId(null)} onChanged={reload} />
      )}
    </div>
  );
}
