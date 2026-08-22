"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck, Clock, Video, Home, Building2, Stethoscope, Star,
  Loader2, Siren, CheckCircle2, XCircle, Paperclip, IndianRupee,
  Navigation, Plus, Trash2, History, ThumbsUp, ThumbsDown, Inbox,
  Car, MapPinCheck, AlertTriangle, MessageCircle, Search, X, FileText,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import EnableNotificationsPrompt from "@/components/EnableNotificationsPrompt";
import { hasActiveDoctorSubscription } from "@/lib/subscription";
import { playMessageChime } from "@/lib/playNotificationSound";
import { FREQUENCY_OPTIONS, DURATION_OPTIONS } from "@/lib/medicalOptions";
import { VIDEO_UNLOCK_DELAY_SECONDS } from "@/lib/videoCall";
import { formatDoctorName } from "@/lib/utils";

interface DoctorProfile {
  specialty: string;
  qualification: string | null;
  avgRating: number;
  registrationFeePaid: boolean;
  trialEndsAt: string | null;
  subscriptionPaidUntil: string | null;
}

interface DoctorMe {
  name: string;
  doctorProfile: DoctorProfile | null;
}

interface Appointment {
  id: string;
  patientId: string;
  status: string;
  consultType: string;
  symptoms: string;
  patientName: string | null;
  relation: string;
  dependentId: string | null;
  allergies: string | null;
  amount: number;
  platformFee: number;
  paymentMethod: string;
  paymentStatus: string;
  paidAt: string | null;
  isEmergency: boolean;
  travelStatus: string;
  scheduledAt: string;
  unreadMessageCount: number;
  patient: {
    name: string;
    mobile: string;
    patientProfile: { lat: number | null; lng: number | null; homeAddress: string | null } | null;
  };
}

interface MedicineRow {
  name: string;
  dosage: string;
  frequency: string;
  frequencyOther: string;
  duration: string;
  durationOther: string;
  instructions: string;
}

const TYPE_ICON: Record<string, React.ElementType> = { HOME: Home, CLINIC: Building2, VIDEO: Video };

function patientLabel(a: Appointment): string {
  return a.relation !== "Self" && a.patientName ? a.patientName : a.patient.name;
}
// Seconds left before a paid video appointment's "Join Video Call" button
// unlocks; 0 once VIDEO_UNLOCK_DELAY_SECONDS has passed since payment.
function videoUnlockRemainingSec(a: Appointment, now: number): number {
  if (!a.paidAt) return 0;
  const unlockAt = new Date(a.paidAt).getTime() + VIDEO_UNLOCK_DELAY_SECONDS * 1000;
  return Math.max(0, Math.ceil((unlockAt - now) / 1000));
}
function historyHref(a: Appointment): string {
  return a.dependentId ? `/doctor/patients/${a.patientId}?dependentId=${a.dependentId}` : `/doctor/patients/${a.patientId}`;
}
const EMPTY_ROW: MedicineRow = { name: "", dosage: "", frequency: "", frequencyOther: "", duration: "", durationOther: "", instructions: "" };

function CompleteVisitForm({ appt, onDone, onCancel }: {
  appt: Appointment;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [medicines, setMedicines] = useState<MedicineRow[]>([{ ...EMPTY_ROW }]);
  const [busy, setBusy] = useState(false);

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    setFiles((cur) => [...cur, ...Array.from(picked)]);
  };
  const removeFile = (i: number) => setFiles((cur) => cur.filter((_, idx) => idx !== i));

  const setMed = (i: number, k: keyof MedicineRow, v: string) => {
    setMedicines((rows) => rows.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, [k]: v };
      if (k === "frequency" && v !== "Other") next.frequencyOther = "";
      if (k === "duration" && v !== "Other") next.durationOther = "";
      return next;
    }));
  };
  const addRow = () => setMedicines((rows) => [...rows, { ...EMPTY_ROW }]);
  const removeRow = (i: number) => setMedicines((rows) => rows.filter((_, idx) => idx !== i));

  const submit = async () => {
    setBusy(true);
    setFileError("");
    await fetch(`/api/appointments/${appt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED", doctorNotes: notes }),
    });
    const validMedicines = medicines
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency === "Other" ? m.frequencyOther.trim() : m.frequency,
        duration: m.duration === "Other" ? m.durationOther.trim() : m.duration,
        instructions: m.instructions,
      }));
    if (validMedicines.length > 0) {
      await fetch(`/api/appointments/${appt.id}/prescription-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicines: validMedicines }),
      });
    }
    if (files.length > 0) {
      const form = new FormData();
      files.forEach((f) => form.append("file", f));
      const res = await fetch(`/api/appointments/${appt.id}/prescription`, { method: "POST", body: form });
      if (!res.ok) {
        setBusy(false);
        setFileError((await res.json().catch(() => ({}))).error ?? "Could not upload attachments.");
        return;
      }
    }
    setBusy(false);
    onDone();
  };

  return (
    <div className="mt-3 bg-teal-50 border border-teal-100 rounded-xl p-4 space-y-3">
      <textarea
        rows={2}
        className="input-field resize-none"
        placeholder="Visit notes / diagnosis (optional)…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Prescription</p>
        <div className="space-y-2">
          {medicines.map((m, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-2.5 grid grid-cols-2 sm:grid-cols-5 gap-1.5 items-center">
              <input className="input-field text-xs py-1.5 col-span-2 sm:col-span-1" placeholder="Medicine name" value={m.name} onChange={(e) => setMed(i, "name", e.target.value)} />
              <input className="input-field text-xs py-1.5" placeholder="Dosage" value={m.dosage} onChange={(e) => setMed(i, "dosage", e.target.value)} />
              <div className="space-y-1">
                <select className="input-field text-xs py-1.5" value={m.frequency} onChange={(e) => setMed(i, "frequency", e.target.value)}>
                  <option value="">Frequency</option>
                  {FREQUENCY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {m.frequency === "Other" && (
                  <input className="input-field text-xs py-1.5" placeholder="Specify frequency" value={m.frequencyOther} onChange={(e) => setMed(i, "frequencyOther", e.target.value)} />
                )}
              </div>
              <div className="space-y-1">
                <select className="input-field text-xs py-1.5" value={m.duration} onChange={(e) => setMed(i, "duration", e.target.value)}>
                  <option value="">Duration</option>
                  {DURATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {m.duration === "Other" && (
                  <input className="input-field text-xs py-1.5" placeholder="Specify duration" value={m.durationOther} onChange={(e) => setMed(i, "durationOther", e.target.value)} />
                )}
              </div>
              <div className="flex gap-1.5">
                <input className="input-field text-xs py-1.5 flex-1" placeholder="Instructions" value={m.instructions} onChange={(e) => setMed(i, "instructions", e.target.value)} />
                {medicines.length > 1 && (
                  <button type="button" onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addRow} className="mt-2 text-xs text-teal-600 font-semibold flex items-center gap-1 hover:underline">
          <Plus className="w-3.5 h-3.5" /> Add medicine
        </button>
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <Paperclip className="w-3.5 h-3.5" />
          Attach reports/scans (PDF/JPG/PNG, optional, multiple allowed)
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden"
            onChange={(e) => addFiles(e.target.files)} />
        </label>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">
                <span className="truncate">{f.name}</span>
                <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileError && <p className="text-xs text-red-500 mt-1">{fileError}</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-secondary py-1.5 px-3 text-xs flex-1 justify-center">Cancel</button>
        <button onClick={submit} disabled={busy} className="btn-primary py-1.5 px-3 text-xs flex-1 justify-center">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark Complete"}
        </button>
      </div>
    </div>
  );
}

function navigateUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export default function DoctorDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [doctor, setDoctor] = useState<DoctorMe | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<{ id: string; message: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Appointment | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [cancelledExpanded, setCancelledExpanded] = useState(false);
  const PAGE_SIZE = 5;

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/dashboard");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    fetch("/api/doctors/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: DoctorMe | null) => {
        setDoctor(d);
        if (d && !d.doctorProfile?.registrationFeePaid) {
          router.push("/doctor/profile");
        } else if (d?.doctorProfile && !hasActiveDoctorSubscription(d.doctorProfile)) {
          router.push("/doctor/subscribe");
        }
      })
      .catch(() => setDoctor(null));
  }, [user, router]);

  const unreadTotalRef = useRef<number | null>(null);
  const loadAppointments = useCallback(() => {
    fetch("/api/appointments/me")
      .then((r) => r.json())
      .then((d: Appointment[]) => {
        setAppointments(d);
        setLoadingAppts(false);
        const total = d.reduce((sum, a) => sum + a.unreadMessageCount, 0);
        if (unreadTotalRef.current !== null && total > unreadTotalRef.current) playMessageChime();
        unreadTotalRef.current = total;
      });
  }, []);

  // Ticks the video-call payment-unlock countdown independently of the 5s data poll.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Poll so a pending request that times out (no response within 30 min)
  // disappears from the queue without the doctor needing to refresh.
  useEffect(() => {
    if (user?.role !== "DOCTOR") return;
    loadAppointments();
    const interval = setInterval(loadAppointments, 5000);
    return () => clearInterval(interval);
  }, [user, loadAppointments]);

  const respond = async (id: string, status: "SCHEDULED" | "REJECTED") => {
    setRespondingId(id);
    setRespondError(null);
    const res = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setRespondingId(null);
    if (!res.ok) {
      setRespondError({ id, message: (await res.json().catch(() => ({}))).error ?? "Could not update this request." });
    }
    loadAppointments();
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    await respond(rejectTarget.id, "REJECTED");
    setRejecting(false);
    setRejectTarget(null);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    await fetch(`/api/appointments/${cancelTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    setCancelling(false);
    setCancelTarget(null);
    loadAppointments();
  };

  // ── Live journey tracking for home visits ───────────────────────────────
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const [startingJourneyId, setStartingJourneyId] = useState<string | null>(null);

  const sendPosition = (apptId: string, travelStatus: "ON_THE_WAY" | "ARRIVED", lat?: number, lng?: number) => {
    return fetch(`/api/appointments/${apptId}/travel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ travelStatus, ...(lat != null && lng != null ? { lat, lng } : {}) }),
    });
  };

  const startJourney = (apptId: string) => {
    if (!navigator.geolocation) return;
    setStartingJourneyId(apptId);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await sendPosition(apptId, "ON_THE_WAY", pos.coords.latitude, pos.coords.longitude);
        setStartingJourneyId(null);
        loadAppointments();
        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(
          (p) => {
            const now = Date.now();
            if (now - lastSentRef.current < 10000) return; // throttle to ~1 update/10s
            lastSentRef.current = now;
            sendPosition(apptId, "ON_THE_WAY", p.coords.latitude, p.coords.longitude);
          },
          () => {},
          { enableHighAccuracy: true }
        );
      },
      () => setStartingJourneyId(null),
      { enableHighAccuracy: true }
    );
  };

  const markArrived = async (apptId: string) => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    await sendPosition(apptId, "ARRIVED");
    loadAppointments();
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  if (
    authLoading || !user || user.role !== "DOCTOR" ||
    !doctor?.doctorProfile?.registrationFeePaid ||
    !hasActiveDoctorSubscription(doctor.doctorProfile)
  ) {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const profile = doctor?.doctorProfile;
  const matchesSearch = (a: Appointment) =>
    patientLabel(a).toLowerCase().includes(search.trim().toLowerCase());
  const completedAll = appointments.filter((a) => a.status === "COMPLETED");
  const pending = appointments.filter((a) => a.status === "PENDING_APPROVAL" && matchesSearch(a));
  const upcoming = appointments.filter((a) => a.status === "SCHEDULED" && matchesSearch(a));
  const cancelled = appointments.filter((a) => a.status === "CANCELLED" && matchesSearch(a));
  const completed = completedAll.filter((a) => a.paymentStatus === "PAID").filter(matchesSearch);
  const totalEarnings = completedAll
    .filter((a) => a.paymentStatus === "PAID")
    .reduce((sum, a) => sum + (a.amount - a.platformFee), 0);

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center shadow-lg">
            <Stethoscope className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{formatDoctorName(doctor?.name ?? user.name)}</h1>
            <p className="text-slate-500 text-sm">
              {profile?.specialty ?? "Specialty pending"} · {profile?.qualification ?? "—"} ·{" "}
              <span className="text-amber-500 font-semibold inline-flex items-center gap-0.5">
                <Star className="w-3.5 h-3.5 fill-current" /> {(profile?.avgRating ?? 0).toFixed(1)}
              </span>
            </p>
          </div>
        </div>

        <EnableNotificationsPrompt />

        {/* Stat Strip */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Consultations", value: String(completedAll.length), color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Total Earnings", value: `₹${totalEarnings.toLocaleString("en-IN")}`, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Avg. Rating", value: `${(profile?.avgRating ?? 0).toFixed(1)} / 5`, color: "text-amber-600", bg: "bg-amber-50" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-2xl p-5`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="input-field pl-10 pr-10"
            placeholder="Search by patient name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Pending Requests */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Inbox className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-slate-800">Pending Requests</h2>
            {pending.length > 0 && <span className="badge badge-warning">{pending.length} new</span>}
          </div>
          <div className="divide-y divide-slate-50">
            {loadingAppts ? (
              <div className="p-6 space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">{search ? "No pending requests match your search." : "No pending requests."}</p>
            ) : (
              pending.map((a) => {
                const Icon = TYPE_ICON[a.consultType] ?? Stethoscope;
                const patientLoc = a.patient.patientProfile;
                return (
                  <div key={a.id} className="px-6 py-4 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.isEmergency ? "bg-red-50" : "bg-amber-50"}`}>
                        <Icon className={`w-5 h-5 ${a.isEmergency ? "text-red-500" : "text-amber-600"}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                          {patientLabel(a)}
                          {a.relation !== "Self" && (
                            <span className="badge badge-gray text-[10px]">{a.relation} of {a.patient.name}</span>
                          )}
                          {a.isEmergency && <span className="badge badge-danger"><Siren className="w-3 h-3" /> Emergency</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {new Date(a.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {a.consultType}
                        </div>
                        <div className="text-sm text-slate-600 mt-0.5">{a.symptoms}</div>
                        {a.allergies && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" /> Allergies: {a.allergies}
                          </div>
                        )}
                        {a.consultType === "HOME" && patientLoc?.lat != null && patientLoc?.lng != null && (
                          <a
                            href={navigateUrl(patientLoc.lat, patientLoc.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold mt-1 hover:underline"
                          >
                            <Navigation className="w-3 h-3" /> {patientLoc.homeAddress || "View patient location"}
                          </a>
                        )}
                        {respondError?.id === a.id && (
                          <div className="text-xs text-red-600 mt-1">{respondError.message}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => setRejectTarget(a)} disabled={respondingId === a.id} className="btn-secondary py-1.5 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50">
                        <ThumbsDown className="w-3.5 h-3.5" /> Reject
                      </button>
                      <button onClick={() => respond(a.id, "SCHEDULED")} disabled={respondingId === a.id} className="btn-primary py-1.5 px-3 text-xs">
                        {respondingId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />} Accept
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-teal-500" />
            <h2 className="font-bold text-slate-800">Upcoming Appointments</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {loadingAppts ? (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
              </div>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">{search ? "No upcoming appointments match your search." : "No upcoming appointments."}</p>
            ) : (
              (upcomingExpanded ? upcoming : upcoming.slice(0, PAGE_SIZE)).map((a) => {
                const Icon = TYPE_ICON[a.consultType] ?? Stethoscope;
                const patientLoc = a.patient.patientProfile;
                return (
                  <div key={a.id} className="px-6 py-4 hover:bg-slate-50/70 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.isEmergency ? "bg-red-50" : "bg-teal-50"}`}>
                          <Icon className={`w-5 h-5 ${a.isEmergency ? "text-red-500" : "text-teal-600"}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                            <Link href={historyHref(a)} className="hover:underline hover:text-teal-600">
                              {patientLabel(a)}
                            </Link>
                            {a.relation !== "Self" && (
                              <span className="badge badge-gray text-[10px]">{a.relation} of {a.patient.name}</span>
                            )}
                            {a.isEmergency && (
                              <span className="badge badge-danger"><Siren className="w-3 h-3" /> Emergency</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {new Date(a.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {a.consultType}
                          </div>
                          <div className="text-sm text-slate-600 mt-0.5">{a.symptoms}</div>
                        {a.allergies && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" /> Allergies: {a.allergies}
                          </div>
                        )}
                          <div className={`text-xs mt-0.5 flex items-center gap-1 ${a.paymentMethod === "ONLINE" && a.paymentStatus !== "PAID" ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                            <IndianRupee className="w-3 h-3" /> {a.amount} · {
                              a.paymentMethod === "ONLINE"
                                ? (a.paymentStatus === "PAID" ? "Paid Online" : "Payment Pending")
                                : "Cash on visit"
                            }
                          </div>
                          {a.consultType === "HOME" && patientLoc?.lat != null && patientLoc?.lng != null && (
                            <a
                              href={navigateUrl(patientLoc.lat, patientLoc.lng)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold mt-1 hover:underline"
                            >
                              <Navigation className="w-3 h-3" /> Navigate to patient
                            </a>
                          )}
                          {a.consultType === "HOME" && a.travelStatus === "ON_THE_WAY" && (
                            <div className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-1 ml-3">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sharing live location with patient
                            </div>
                          )}
                          {a.consultType === "HOME" && a.travelStatus === "ARRIVED" && (
                            <div className="inline-flex items-center gap-1 text-xs text-slate-500 font-semibold mt-1 ml-3">
                              <MapPinCheck className="w-3 h-3" /> Marked arrived
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Link href={historyHref(a)} className="btn-secondary py-1.5 px-3 text-xs" title="Patient history">
                          <History className="w-3.5 h-3.5" />
                        </Link>
                        <Link href={`/doctor/chat/${a.id}`} className="relative btn-secondary py-1.5 px-3 text-xs" title="Chat with patient">
                          <MessageCircle className="w-3.5 h-3.5" />
                          {a.unreadMessageCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border border-white text-white text-[10px] font-bold flex items-center justify-center">
                              {a.unreadMessageCount > 9 ? "9+" : a.unreadMessageCount}
                            </span>
                          )}
                        </Link>
                        {a.consultType === "VIDEO" && a.paymentStatus === "PAID" && (
                          videoUnlockRemainingSec(a, now) > 0 ? (
                            <span
                              className="btn-secondary py-1.5 px-3 text-xs opacity-60 cursor-not-allowed"
                              title={`Video call unlocking in ${videoUnlockRemainingSec(a, now)}s`}
                            >
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            </span>
                          ) : (
                            <Link href={`/doctor/video/${a.id}`} className="btn-secondary py-1.5 px-3 text-xs" title="Join video call">
                              <Video className="w-3.5 h-3.5" />
                            </Link>
                          )
                        )}
                        {a.consultType === "HOME" && a.travelStatus === "NOT_STARTED" && (
                          <button onClick={() => startJourney(a.id)} disabled={startingJourneyId === a.id} className="btn-secondary py-1.5 px-3 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                            {startingJourneyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Car className="w-3.5 h-3.5" />} Start Journey
                          </button>
                        )}
                        {a.consultType === "HOME" && a.travelStatus === "ON_THE_WAY" && (
                          <button onClick={() => markArrived(a.id)} className="btn-secondary py-1.5 px-3 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                            <MapPinCheck className="w-3.5 h-3.5" /> Arrived
                          </button>
                        )}
                        <button onClick={() => setCancelTarget(a)} className="btn-secondary py-1.5 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50">
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                        {(a.consultType !== "HOME" || a.travelStatus === "ARRIVED") && (
                          a.paymentMethod === "ONLINE" && a.paymentStatus !== "PAID" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-semibold px-1" title="Waiting for the patient to pay before this can be marked complete">
                              <Clock className="w-3.5 h-3.5" /> Awaiting payment
                            </span>
                          ) : (
                            <button onClick={() => setCompletingId(completingId === a.id ? null : a.id)} className="btn-primary py-1.5 px-3 text-xs">
                              <FileText className="w-3.5 h-3.5" /> Start Prescription
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    {completingId === a.id && (
                      <CompleteVisitForm
                        appt={a}
                        onCancel={() => setCompletingId(null)}
                        onDone={() => { setCompletingId(null); loadAppointments(); }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
          {!upcomingExpanded && upcoming.length > PAGE_SIZE && (
            <button onClick={() => setUpcomingExpanded(true)} className="w-full py-3 text-xs font-semibold text-teal-600 hover:bg-teal-50 border-t border-slate-100 transition-colors">
              Load {upcoming.length - PAGE_SIZE} more
            </button>
          )}
        </div>

        {/* Recent Completed */}
        {completed.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h2 className="font-bold text-slate-800">Recent Completed Visits</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {(completedExpanded ? completed : completed.slice(0, PAGE_SIZE)).map((a) => (
                <div key={a.id} className="px-6 py-3.5 flex items-center justify-between">
                  <div>
                    <Link href={historyHref(a)} className="font-semibold text-slate-800 text-sm hover:underline hover:text-teal-600">
                      {patientLabel(a)}
                    </Link>
                    {a.relation !== "Self" && (
                      <span className="badge badge-gray text-[10px] ml-1.5">{a.relation} of {a.patient.name}</span>
                    )}
                    <div className="text-xs text-slate-400">
                      {new Date(a.scheduledAt).toLocaleDateString("en-IN", { dateStyle: "medium" })} · {a.consultType}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-slate-700">₹{a.amount - a.platformFee}</div>
                </div>
              ))}
            </div>
            {!completedExpanded && completed.length > PAGE_SIZE && (
              <button onClick={() => setCompletedExpanded(true)} className="w-full py-3 text-xs font-semibold text-teal-600 hover:bg-teal-50 border-t border-slate-100 transition-colors">
                Load {completed.length - PAGE_SIZE} more
              </button>
            )}
          </div>
        )}

        {/* Cancelled */}
        {cancelled.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" />
              <h2 className="font-bold text-slate-800">Cancelled Appointments</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {(cancelledExpanded ? cancelled : cancelled.slice(0, PAGE_SIZE)).map((a) => (
                <div key={a.id} className="px-6 py-3.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-500 text-sm">{patientLabel(a)}</span>
                    {a.relation !== "Self" && (
                      <span className="badge badge-gray text-[10px] ml-1.5">{a.relation} of {a.patient.name}</span>
                    )}
                    <div className="text-xs text-slate-400">
                      {new Date(a.scheduledAt).toLocaleDateString("en-IN", { dateStyle: "medium" })} · {a.consultType}
                    </div>
                  </div>
                  <span className="badge badge-danger">Cancelled</span>
                </div>
              ))}
            </div>
            {!cancelledExpanded && cancelled.length > PAGE_SIZE && (
              <button onClick={() => setCancelledExpanded(true)} className="w-full py-3 text-xs font-semibold text-teal-600 hover:bg-teal-50 border-t border-slate-100 transition-colors">
                Load {cancelled.length - PAGE_SIZE} more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cancel confirmation */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-800">Cancel this appointment?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              {patientLabel(cancelTarget)}&apos;s appointment on {new Date(cancelTarget.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} will be cancelled. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setCancelTarget(null)} className="btn-secondary flex-1">
                Keep Appointment
              </button>
              <button onClick={confirmCancel} disabled={cancelling} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {cancelling ? "Cancelling…" : "Cancel Appointment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject confirmation */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <ThumbsDown className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-800">Reject this request?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              {patientLabel(rejectTarget)}&apos;s request will be declined. They&apos;ll need to book again with another doctor. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRejectTarget(null)} className="btn-secondary flex-1">
                Keep Request
              </button>
              <button onClick={confirmReject} disabled={rejecting} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {rejecting ? "Rejecting…" : "Reject Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
