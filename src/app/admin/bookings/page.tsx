"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, CalendarCheck, Eye, X, FileText, Pill, FlaskConical, Phone, Download } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { cn, formatDoctorName } from "@/lib/utils";
import { brandGridTheme } from "@/lib/agGridTheme";
import PrescriptionDownloadButton from "@/components/patient/PrescriptionDownloadButton";
import type { PrescriptionData } from "@/components/patient/PrescriptionDocument";

interface Appointment {
  id: string;
  patient: { name: string };
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

interface AppointmentDetail extends Appointment {
  id: string;
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
  doctorNotes: string | null;
  prescriptionUrl: string | null;
  medicines: Medicine[];
  tests: Test[];
  attachments: Attachment[];
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

function downloadUrl(fileUrl: string, name: string) {
  return `/api/files/download?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(name)}`;
}

function toPrescriptionData(a: AppointmentDetail): PrescriptionData {
  return {
    id: a.id,
    scheduledAt: a.scheduledAt,
    patientName: a.patientName,
    accountHolderName: a.patient.name,
    relation: a.relation,
    patientAge: a.patient.patientProfile?.age ?? null,
    patientGender: a.patient.patientProfile?.gender ?? null,
    patientAddress: a.patient.patientProfile?.homeAddress ?? null,
    doctorName: a.doctor.name,
    doctorQualification: a.doctor.doctorProfile?.qualification ?? null,
    doctorRegNo: a.doctor.doctorProfile?.medRegNo ?? null,
    doctorSpecialty: a.doctor.doctorProfile?.specialty ?? "General Physician",
    clinicName: a.doctor.doctorProfile?.clinicName ?? null,
    doctorNotes: a.doctorNotes,
    doctorSignatureUrl: a.doctor.doctorProfile?.signatureUrl ?? null,
    medicines: a.medicines.map((m) => ({
      name: m.name, dosage: m.dosage, frequency: m.frequency, duration: m.duration, instructions: m.instructions,
    })),
    tests: a.tests.map((t) => ({ name: t.name, instructions: t.instructions })),
  };
}

// ── Booking Detail Drawer ────────────────────────────────────────
function BookingDrawer({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [data, setData] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/bookings/${bookingId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [bookingId]);

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
              {data && (data.relation !== "Self" && data.patientName ? data.patientName : data.patient.name)}
            </div>
            <div className="text-blue-100 text-sm mt-0.5">
              {data ? `with ${formatDoctorName(data.doctor.name)}` : "Loading…"}
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
          ) : data && (
            <div className="p-6 space-y-6">

              {/* Summary */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={STATUS_BADGE[data.status] ?? "badge badge-gray"}>{data.status}</span>
                <span className={TYPE_BADGE[data.consultType] ?? "badge badge-gray"}>{data.consultType}</span>
                <span className="text-sm text-slate-500">₹{data.amount}</span>
                <span className="text-xs text-slate-400">{new Date(data.createdAt).toLocaleDateString("en-IN")}</span>
              </div>

              <Section title="Patient" icon={Phone}>
                <Row label="Name" value={data.relation !== "Self" && data.patientName ? `${data.patientName} (${data.relation} of ${data.patient.name})` : data.patient.name} />
                <Row label="Mobile" value={data.patient.mobile} />
                <Row label="Symptoms" value={data.symptoms || "—"} />
              </Section>

              <Section title="Doctor" icon={Phone}>
                <Row label="Name" value={formatDoctorName(data.doctor.name)} />
                <Row label="Specialty" value={data.doctor.doctorProfile?.specialty ?? "—"} />
                <Row label="Mobile" value={data.doctor.mobile} />
              </Section>

              {/* Documents / Reports / Prescription */}
              <Section title="Documents & Prescription" icon={FileText}>
                {!hasDocuments && data.medicines.length === 0 && data.tests.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-400 text-center">No documents uploaded for this booking</div>
                ) : (
                  <div className="p-4 space-y-4">
                    {(data.medicines.length > 0 || data.tests.length > 0) && (
                      <PrescriptionDownloadButton
                        appointmentId={data.id}
                        patientId={data.patientId}
                        data={toPrescriptionData(data)}
                      />
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
  const [bookings, setBookings] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [viewId, setViewId] = useState<string | null>(null);

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
        const name = b.relation !== "Self" && b.patientName ? b.patientName : b.patient.name;
        return (
          <div className="leading-tight py-1">
            <div className="font-semibold text-slate-900">{name}</div>
            {b.relation !== "Self" && (
              <div className="text-xs font-normal text-slate-400">{b.relation} of {b.patient.name}</div>
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
      valueFormatter: (p: ValueFormatterParams<Appointment>) => formatDoctorName(p.value ?? ""),
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

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4 sm:p-6 lg:p-8 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
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
        <BookingDrawer bookingId={viewId} onClose={() => setViewId(null)} />
      )}
    </div>
  );
}
