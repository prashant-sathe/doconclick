"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck, Clock, Video, Home, Building2, Stethoscope, Star,
  Loader2, Siren, CheckCircle2, XCircle, Paperclip, IndianRupee,
  Navigation, Plus, Trash2, History, ThumbsUp, ThumbsDown, Inbox,
  Car, MapPinCheck, AlertTriangle, MessageCircle,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";

interface DoctorProfile {
  specialty: string;
  qualification: string | null;
  avgRating: number;
  registrationFeePaid: boolean;
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
  allergies: string | null;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  isEmergency: boolean;
  prescriptionUrl: string | null;
  travelStatus: string;
  scheduledAt: string;
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
  duration: string;
  instructions: string;
}

const TYPE_ICON: Record<string, React.ElementType> = { HOME: Home, CLINIC: Building2, VIDEO: Video };

function patientLabel(a: Appointment): string {
  return a.relation !== "Self" && a.patientName ? a.patientName : a.patient.name;
}
const EMPTY_ROW: MedicineRow = { name: "", dosage: "", frequency: "", duration: "", instructions: "" };

function CompleteVisitForm({ appt, onDone, onCancel }: {
  appt: Appointment;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [medicines, setMedicines] = useState<MedicineRow[]>([{ ...EMPTY_ROW }]);
  const [busy, setBusy] = useState(false);

  const setMed = (i: number, k: keyof MedicineRow, v: string) => {
    setMedicines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  };
  const addRow = () => setMedicines((rows) => [...rows, { ...EMPTY_ROW }]);
  const removeRow = (i: number) => setMedicines((rows) => rows.filter((_, idx) => idx !== i));

  const submit = async () => {
    setBusy(true);
    await fetch(`/api/appointments/${appt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED", doctorNotes: notes }),
    });
    const validMedicines = medicines.filter((m) => m.name.trim());
    if (validMedicines.length > 0) {
      await fetch(`/api/appointments/${appt.id}/prescription-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicines: validMedicines }),
      });
    }
    if (file) {
      const form = new FormData();
      form.append("file", file);
      await fetch(`/api/appointments/${appt.id}/prescription`, { method: "POST", body: form });
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
              <input className="input-field text-xs py-1.5" placeholder="Frequency" value={m.frequency} onChange={(e) => setMed(i, "frequency", e.target.value)} />
              <input className="input-field text-xs py-1.5" placeholder="Duration" value={m.duration} onChange={(e) => setMed(i, "duration", e.target.value)} />
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

      <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
        <Paperclip className="w-3.5 h-3.5" />
        {file ? file.name : "Attach a report/scan (PDF/JPG/PNG, optional)"}
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
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
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

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
        if (d && !d.doctorProfile?.registrationFeePaid) router.push("/doctor/payment");
      })
      .catch(() => setDoctor(null));
  }, [user, router]);

  const loadAppointments = useCallback(() => {
    setLoadingAppts(true);
    fetch("/api/appointments/me")
      .then((r) => r.json())
      .then((d) => { setAppointments(d); setLoadingAppts(false); });
  }, []);

  useEffect(() => {
    if (user?.role === "DOCTOR") loadAppointments();
  }, [user, loadAppointments]);

  const respond = async (id: string, status: "SCHEDULED" | "REJECTED") => {
    setRespondingId(id);
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setRespondingId(null);
    loadAppointments();
  };

  const cancelAppointment = async (id: string) => {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
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

  if (authLoading || !user || user.role !== "DOCTOR" || !doctor?.doctorProfile?.registrationFeePaid) {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const profile = doctor?.doctorProfile;
  const pending = appointments.filter((a) => a.status === "PENDING_APPROVAL");
  const upcoming = appointments.filter((a) => a.status === "SCHEDULED");
  const completed = appointments.filter((a) => a.status === "COMPLETED");
  const totalEarnings = completed.reduce((sum, a) => sum + a.amount, 0);

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
            <h1 className="text-2xl font-extrabold text-slate-900">{doctor?.name ?? user.name}</h1>
            <p className="text-slate-500 text-sm">
              {profile?.specialty ?? "Specialty pending"} · {profile?.qualification ?? "—"} ·{" "}
              <span className="text-amber-500 font-semibold inline-flex items-center gap-0.5">
                <Star className="w-3.5 h-3.5 fill-current" /> {(profile?.avgRating ?? 0).toFixed(1)}
              </span>
            </p>
          </div>
        </div>

        {/* Stat Strip */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Consultations", value: String(completed.length), color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Total Earnings", value: `₹${totalEarnings.toLocaleString("en-IN")}`, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Avg. Rating", value: `${(profile?.avgRating ?? 0).toFixed(1)} / 5`, color: "text-amber-600", bg: "bg-amber-50" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-2xl p-5`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
            </div>
          ))}
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
              <p className="text-sm text-slate-400 text-center py-10">No pending requests.</p>
            ) : (
              pending.map((a) => {
                const Icon = TYPE_ICON[a.consultType] ?? Stethoscope;
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
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => respond(a.id, "REJECTED")} disabled={respondingId === a.id} className="btn-secondary py-1.5 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50">
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
              <p className="text-sm text-slate-400 text-center py-10">No upcoming appointments.</p>
            ) : (
              upcoming.map((a) => {
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
                            <Link href={`/doctor/patients/${a.patientId}`} className="hover:underline hover:text-teal-600">
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
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <IndianRupee className="w-3 h-3" /> {a.amount} · {a.paymentMethod === "ONLINE" ? "Paid Online" : "Cash on visit"}
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
                        <Link href={`/doctor/patients/${a.patientId}`} className="btn-secondary py-1.5 px-3 text-xs" title="Patient history">
                          <History className="w-3.5 h-3.5" />
                        </Link>
                        <Link href={`/doctor/chat/${a.id}`} className="btn-secondary py-1.5 px-3 text-xs" title="Chat with patient">
                          <MessageCircle className="w-3.5 h-3.5" />
                        </Link>
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
                        <button onClick={() => cancelAppointment(a.id)} className="btn-secondary py-1.5 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50">
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                        {(a.consultType !== "HOME" || a.travelStatus === "ARRIVED") && (
                          <button onClick={() => setCompletingId(completingId === a.id ? null : a.id)} className="btn-primary py-1.5 px-3 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
                          </button>
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
        </div>

        {/* Recent Completed */}
        {completed.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h2 className="font-bold text-slate-800">Recent Completed Visits</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {completed.slice(0, 5).map((a) => (
                <div key={a.id} className="px-6 py-3.5 flex items-center justify-between">
                  <div>
                    <Link href={`/doctor/patients/${a.patientId}`} className="font-semibold text-slate-800 text-sm hover:underline hover:text-teal-600">
                      {patientLabel(a)}
                    </Link>
                    {a.relation !== "Self" && (
                      <span className="badge badge-gray text-[10px] ml-1.5">{a.relation} of {a.patient.name}</span>
                    )}
                    <div className="text-xs text-slate-400">
                      {new Date(a.scheduledAt).toLocaleDateString("en-IN", { dateStyle: "medium" })} · {a.consultType}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-slate-700">₹{a.amount}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
