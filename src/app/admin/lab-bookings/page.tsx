"use client";
import { useCallback, useEffect, useState } from "react";
import { TestTubes, Loader2, AlertCircle, Search, Phone, Wallet, CreditCard, MapPin, StickyNote, XCircle, Upload, FileText, Trash2, Share2, CalendarClock } from "lucide-react";
import { mapsUrl, addressWithPin, collectionDayLabel, labShareText, slotLabel, whatsAppShareUrl } from "@/lib/labShare";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

type Status = "PENDING_PAYMENT" | "REQUESTED" | "CONFIRMED" | "SAMPLE_COLLECTED" | "COMPLETED" | "CANCELLED";
const STATUSES: Status[] = ["REQUESTED", "CONFIRMED", "SAMPLE_COLLECTED", "COMPLETED", "CANCELLED", "PENDING_PAYMENT"];
// What an admin can pick by hand (an unpaid booking only ends by payment or cancel).
const SETTABLE: Status[] = ["REQUESTED", "CONFIRMED", "SAMPLE_COLLECTED", "COMPLETED", "CANCELLED"];
const STATUS_LABEL: Record<Status, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  SAMPLE_COLLECTED: "Sample collected",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
const STATUS_BADGE: Record<Status, string> = {
  PENDING_PAYMENT: "badge-gray",
  REQUESTED: "badge-warning",
  CONFIRMED: "badge-info",
  SAMPLE_COLLECTED: "badge-purple",
  COMPLETED: "badge-success",
  CANCELLED: "badge-gray",
};

interface Booking {
  id: string;
  patientName: string;
  patientAge: number | null;
  patientGender: string | null;
  address: string;
  pinCode: string | null;
  lat: number | null;
  lng: number | null;
  collectionDate: string | null;
  collectionSlot: string | null;
  notes: string | null;
  totalAmount: number;
  paymentMethod: "WALLET" | "ONLINE";
  paymentStatus: "PENDING" | "PAID" | "REFUNDED";
  status: Status;
  adminNote: string | null;
  cancelledBy: string | null;
  createdAt: string;
  items: { id: string; name: string; b2bPrice: number; commissionPercent: number; price: number }[];
  reports: { id: string; fileUrl: string; fileName: string | null; createdAt: string }[];
  patient: { id: string; name: string; mobile: string };
  appointment: { id: string; scheduledAt: string; doctor: { name: string } } | null;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const downloadHref = (url: string, name: string | null, inline = false) =>
  `/api/files/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name || "lab-report")}${inline ? "&disposition=inline" : ""}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function BookingCard({ b, onChanged }: { b: Booking; onChanged: (b: Booking) => void }) {
  const [note, setNote] = useState(b.adminNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareText = labShareText({
    patientName: b.patientName, patientAge: b.patientAge, patientGender: b.patientGender, mobile: b.patient.mobile,
    tests: b.items.map((i) => i.name), address: b.address, pinCode: b.pinCode, lat: b.lat, lng: b.lng,
    collectionDate: b.collectionDate, collectionSlot: b.collectionSlot, notes: b.notes,
  });
  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Couldn't copy — select the text in WhatsApp instead."); }
  };
  const [deleteReport, setDeleteReport] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    const res = await fetch(`/api/admin/lab-bookings/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
    onChanged(await res.json());
  };

  const upload = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    setBusy(true); setUploading(true); setError("");
    const form = new FormData();
    // Read into memory first — Android WebViews can't stream content:// files into fetch().
    for (const f of Array.from(picked)) form.append("file", new File([await f.arrayBuffer()], f.name, { type: f.type }), f.name);
    const res = await fetch(`/api/admin/lab-bookings/${b.id}/reports`, { method: "POST", body: form }).catch(() => null);
    setBusy(false); setUploading(false);
    if (!res || !res.ok) { setError((await res?.json().catch(() => ({})))?.error ?? "Could not upload the report."); return; }
    onChanged(await res.json());
  };

  const removeReport = async () => {
    if (!deleteReport) return;
    setBusy(true); setError("");
    const res = await fetch(`/api/admin/lab-bookings/${b.id}/reports/${deleteReport}`, { method: "DELETE" });
    setBusy(false); setDeleteReport(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not delete the report."); return; }
    onChanged({ ...b, reports: b.reports.filter((r) => r.id !== deleteReport) });
  };

  const b2bTotal = b.items.reduce((s, i) => s + i.b2bPrice, 0);
  const closed = b.status === "CANCELLED";
  const noteChanged = (note.trim() || null) !== (b.adminNote ?? null);

  return (
    <div className={cn("bg-white rounded-2xl border shadow-sm p-5", closed ? "border-slate-200 opacity-75" : "border-slate-100")}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
            {b.patientName}
            {(b.patientAge != null || b.patientGender) && (
              <span className="text-sm font-normal text-slate-500">{[b.patientAge != null ? `${b.patientAge} y` : null, b.patientGender].filter(Boolean).join(", ")}</span>
            )}
            {b.patientName !== b.patient.name && <span className="text-xs font-normal text-slate-400">(account: {b.patient.name})</span>}
            <span className={cn("badge text-[10px]", STATUS_BADGE[b.status])}>{STATUS_LABEL[b.status]}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
            <a href={`tel:${b.patient.mobile}`} className="inline-flex items-center gap-1 hover:text-teal-600"><Phone className="w-3 h-3" />{b.patient.mobile}</a>
            <span>Booked {when(b.createdAt)}</span>
            {b.appointment && <span>Prescribed by {b.appointment.doctor.name} · visit {when(b.appointment.scheduledAt)}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold text-slate-900">{rupees(b.totalAmount)}</p>
          <p className="text-xs text-slate-500">B2B {rupees(b2bTotal)} · margin {rupees(b.totalAmount - b2bTotal)}</p>
          <p className="text-xs mt-1 inline-flex items-center gap-1 font-semibold">
            {b.paymentMethod === "WALLET" ? <Wallet className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
            {b.paymentMethod === "WALLET" ? "Wallet" : "Online"} ·{" "}
            <span className={b.paymentStatus === "PAID" ? "text-emerald-600" : b.paymentStatus === "REFUNDED" ? "text-slate-500" : "text-amber-600"}>
              {b.paymentStatus === "PAID" ? "Paid" : b.paymentStatus === "REFUNDED" ? "Refunded to wallet" : "Not paid yet"}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3 border border-slate-100 rounded-xl divide-y divide-slate-50">
        {b.items.map((i) => (
          <div key={i.id} className="px-3 py-2 text-sm flex justify-between gap-3">
            <span className="text-slate-800">{i.name}</span>
            <span className="text-slate-500 whitespace-nowrap">{rupees(i.b2bPrice)} + {i.commissionPercent}% = <span className="font-semibold text-slate-800">{rupees(i.price)}</span></span>
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-600 mt-3 flex items-start gap-1.5"><MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <span>
          {addressWithPin(b.address, b.pinCode)}
          {b.lat != null && b.lng != null ? (
            <a href={mapsUrl(b.lat, b.lng)} target="_blank" rel="noreferrer" className="block text-xs font-semibold text-teal-700 hover:underline mt-0.5">
              Open pin in Google Maps · {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
            </a>
          ) : (
            <span className="block text-xs text-amber-600 mt-0.5">No map pin on this booking</span>
          )}
        </span>
      </p>
      <p className="text-sm text-slate-600 mt-1 flex items-start gap-1.5">
        <CalendarClock className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        {b.collectionDate && b.collectionSlot ? <>Patient&apos;s slot: <span className="font-semibold text-slate-800">{collectionDayLabel(b.collectionDate)}, {slotLabel(b.collectionSlot)}</span></> : "Collection slot not picked"}
      </p>
      {b.notes && <p className="text-sm text-slate-600 mt-1 flex items-start gap-1.5"><StickyNote className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />{b.notes}</p>}
      {closed && b.cancelledBy && <p className="text-xs text-slate-500 mt-2">Cancelled by {b.cancelledBy === "PATIENT" ? "the patient" : "an admin"}.</p>}

      {b.status === "PENDING_PAYMENT" && (
        <p className="text-xs text-slate-500 mt-3">Waiting for the patient to finish the online payment — nothing to do yet.</p>
      )}

      {!closed && b.status !== "PENDING_PAYMENT" && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <a
            href={whatsAppShareUrl(shareText)}
            target="_blank"
            rel="noreferrer"
            className="btn-primary py-2 px-4 text-sm inline-flex bg-[#25D366] hover:bg-[#1ebe5b] border-[#25D366]"
            title="Opens WhatsApp — pick the lab / collection person to send the details to"
          >
            <Share2 className="w-4 h-4" /> Share on WhatsApp
          </a>
          <button type="button" onClick={copyShare} className="btn-secondary py-2 px-3 text-sm">{copied ? "Copied" : "Copy details"}</button>
        </div>
      )}

      {!closed && b.status !== "PENDING_PAYMENT" && (
        <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Report</p>
          {b.reports.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {b.reports.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-teal-600 flex-shrink-0" />
                  <a href={downloadHref(r.fileUrl, r.fileName, true)} target="_blank" rel="noreferrer" className="text-teal-700 font-semibold hover:underline truncate">{r.fileName || "Lab report"}</a>
                  <span className="text-xs text-slate-400 flex-shrink-0">{when(r.createdAt)}</span>
                  <button title="Delete report" disabled={busy} onClick={() => setDeleteReport(r.id)} className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <label className={cn("btn-secondary py-2 px-3 text-xs inline-flex cursor-pointer", busy && "opacity-60 pointer-events-none")}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {b.reports.length ? "Upload another file" : "Upload report (PDF / JPG / PNG)"}
            <input type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          </label>
          <p className="text-[11px] text-slate-500 mt-1.5">The patient is notified, sees it under My lab tests and in their records vault. Uploading marks the booking Completed.</p>
        </div>
      )}

      {!closed && b.status !== "PENDING_PAYMENT" && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3 items-start">
          <div>
            <label className="input-label">Status</label>
            <select
              className="input-field"
              value={b.status}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as Status;
                if (next === "CANCELLED") setConfirmCancel(true);
                else void patch({ status: next });
              }}
            >
              {SETTABLE.filter((s) => s !== "CANCELLED" || b.status !== "COMPLETED").map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">Note to patient (they see this)</label>
            <div className="flex gap-2">
              <input className="input-field flex-1" maxLength={500} placeholder="e.g. Sample collection tomorrow 8–9 AM" value={note} onChange={(e) => setNote(e.target.value)} />
              <button onClick={() => patch({ adminNote: note })} disabled={busy || !noteChanged} className="btn-primary py-2 px-4 text-sm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      {closed && b.adminNote && <p className="text-xs text-slate-500 mt-2">Note: {b.adminNote}</p>}
      {closed && b.reports.length > 0 && (
        <p className="text-xs text-slate-500 mt-1">Reports: {b.reports.map((r) => r.fileName || "Lab report").join(", ")}</p>
      )}
      {error && <p className="text-sm text-red-600 mt-2 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{error}</p>}

      {confirmCancel && (
        <ConfirmDialog
          icon={XCircle}
          tone="danger"
          title="Cancel this lab booking?"
          message={b.paymentStatus === "PAID"
            ? `${rupees(b.totalAmount)} goes back to the patient's wallet. The note above is sent with it.`
            : "The patient is notified. This can't be undone."}
          confirmLabel="Cancel booking"
          busy={busy}
          onCancel={() => setConfirmCancel(false)}
          onConfirm={async () => { await patch({ status: "CANCELLED", ...(noteChanged ? { adminNote: note } : {}) }); setConfirmCancel(false); }}
        />
      )}
      {deleteReport && (
        <ConfirmDialog
          icon={Trash2}
          tone="danger"
          title="Delete this report?"
          message="It's removed from the booking and from the patient's records vault."
          confirmLabel="Delete"
          busy={busy}
          onCancel={() => setDeleteReport(null)}
          onConfirm={removeReport}
        />
      )}
    </div>
  );
}

export default function AdminLabBookings() {
  const [filter, setFilter] = useState<Status | "ALL">("REQUESTED");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ bookings: Booking[]; counts: Record<Status, number> } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: filter });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/admin/lab-bookings?${params}`);
    setLoading(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not load lab bookings."); return; }
    setError("");
    setData(await res.json());
  }, [filter, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const replace = (b: Booking) => {
    // Changing status moves the card out of a filtered list — reload to keep counts right.
    if (filter !== "ALL" && b.status !== filter) { void load(); return; }
    setData((d) => d && { ...d, bookings: d.bookings.map((x) => (x.id === b.id ? b : x)) });
  };

  const total = data ? Object.values(data.counts).reduce((s, n) => s + n, 0) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2"><TestTubes className="w-6 h-6 text-teal-600" />Lab Bookings</h1>
        <p className="text-slate-500 text-sm mt-1">Lab tests patients booked from their prescriptions. Change the status here — the patient sees it and gets a notification.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", filter === s ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-200 hover:border-teal-300")}
          >
            {s === "ALL" ? "All" : STATUS_LABEL[s]} {data && <span className="opacity-75">({s === "ALL" ? total : data.counts[s] ?? 0})</span>}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm mb-5">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input-field pl-9" placeholder="Search patient name or mobile" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error} <button onClick={load} className="underline font-semibold">Retry</button></div>}

      {data === null ? (
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      ) : (
        <div className={cn("max-w-4xl space-y-3", loading && "opacity-60")}>
          {data.bookings.map((b) => <BookingCard key={b.id} b={b} onChanged={replace} />)}
          {data.bookings.length === 0 && <p className="text-sm text-slate-400 py-10 text-center">No lab bookings here.</p>}
        </div>
      )}
    </div>
  );
}
