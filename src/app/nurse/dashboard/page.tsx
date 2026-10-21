"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, Clock, MapPin, Navigation, Phone, MessageCircle, FileText, CheckCircle2, XCircle,
  Car, Flag, AlertTriangle, IndianRupee, User as UserIcon, CalendarClock, Star, KeyRound, Layers, Stethoscope, Activity,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { NurseHeader, NurseMobileNav } from "@/components/nurse/NurseNav";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import RescheduleRequestBox from "@/components/RescheduleRequestBox";
import { getCurrentPositionCompat } from "@/lib/platform";
import { useJourneyTracker } from "@/components/JourneyTracker";
import { cn } from "@/lib/utils";
import { mutate, useLoad } from "@/lib/apiClient";
import { intervalLabel, visitStartProblem, shiftCompleteProblem } from "@/lib/nursePackage";
import { SUGAR_TYPES, fToC, cToF, vitalsSummary, type VitalsInput } from "@/lib/vitals";

type VitalRow = VitalsInput & { id: string; recordedAt: string; alertLevel: string; alerts: string | null };

type Visit = {
  id: string;
  patientId: string;
  // Where to go: the address snapshotted at booking (profile for older rows).
  visit: { address: string | null; landmark: string | null; pinCode: string | null; lat: number | null; lng: number | null } | null;
  dependentId: string | null;
  vitals: VitalRow[];
  nurseService: { kind: string; durationMinutes: number } | null;
  status: string;
  serviceName: string | null;
  symptoms: string;
  patientName: string | null;
  relation: string;
  allergies: string | null;
  amount: number;
  platformFee: number;
  paymentStatus: string;
  travelStatus: string;
  scheduledAt: string;
  requestedScheduledAt: string | null;
  createdAt: string;
  doctorNotes: string | null;
  unreadMessageCount: number;
  patient: {
    name: string;
    mobile: string;
    patientProfile: { lat: number | null; lng: number | null; homeAddress: string | null; landmark: string | null; pinCode: string | null; age: number; gender: string } | null;
  };
  dependent: { age: number | null; gender: string | null } | null;
  prescriptionDoc: { title: string; fileUrl: string; fileName: string | null } | null;
  review: { rating: number; comment: string | null } | null;
  packageId: string | null;
  packageIndex: number | null;
  package: { visits: number; intervalDays: number } | null;
  visitStartedAt: string | null;
  visitStartNote: string | null;
  nurseReferral: {
    instructions: string | null;
    appointment: {
      scheduledAt: string;
      doctorNotes: string | null;
      doctor: { name: string };
      medicines: { name: string; dosage: string; frequency: string; duration: string; instructions: string | null }[];
    };
  } | null;
};

const TABS = [
  { id: "requests", label: "Requests" },
  { id: "upcoming", label: "Upcoming" },
  { id: "history", label: "History" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed", CANCELLED: "Cancelled", REJECTED: "Declined", EXPIRED: "Expired", NO_SHOW: "No-show",
};

function patientLabel(v: Visit) {
  return v.relation !== "Self" && v.patientName ? v.patientName : v.patient.name;
}

function ageGender(v: Visit) {
  const age = v.relation !== "Self" ? v.dependent?.age : v.patient.patientProfile?.age;
  const gender = v.relation !== "Self" ? v.dependent?.gender : v.patient.patientProfile?.gender;
  return [age ? `${age} yrs` : null, gender || null].filter(Boolean).join(" · ");
}

// Directions to the address snapshotted when the visit was booked (the
// profile for older rows) — never the patient's current profile address.
function directionsUrl(v: Visit) {
  const p = v.visit;
  if (p?.lat != null && p?.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  if (p?.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`;
  return null;
}

// Vitals at the visit. Temperature is entered in °F (what home thermometers
// in India show) and stored in °C. A critical reading shows what to do right
// away; the server has already pushed it to the patient (and the referring
// doctor, if any).
function RecordVitalsBox({ visit, onSaved }: { visit: Visit; onSaved: () => void }) {
  const [open, setOpen] = useState(visit.vitals.length === 0);
  const [f, setF] = useState({ systolic: "", diastolic: "", pulse: "", spo2: "", tempF: "", sugar: "", sugarType: "RANDOM", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ level: string; alerts: { level: string; message: string }[]; doctorAlerted: boolean } | null>(null);
  const [previous, setPrevious] = useState<VitalRow | null | undefined>(undefined);

  useEffect(() => {
    const qs = new URLSearchParams({ patientId: visit.patientId, limit: "5", ...(visit.dependentId ? { dependentId: visit.dependentId } : {}) });
    fetch(`/api/vitals?${qs}`).then((r) => (r.ok ? r.json() : [])).then((rows: (VitalRow & { appointmentId: string | null })[]) => {
      setPrevious(rows.find((r) => r.appointmentId !== visit.id) ?? null);
    }).catch(() => setPrevious(null));
  }, [visit.patientId, visit.dependentId, visit.id]);

  const set = (k: keyof typeof f, val: string) => { setF((x) => ({ ...x, [k]: val })); setError(""); };
  const save = async () => {
    setBusy(true); setError("");
    const res = await mutate<{ level: string; alerts?: { level: string; message: string }[]; doctorAlerted?: boolean }>(`/api/appointments/${visit.id}/vitals`, {
      body: {
        systolic: f.systolic, diastolic: f.diastolic, pulse: f.pulse, spo2: f.spo2,
        temperatureC: f.tempF ? fToC(Number(f.tempF)) : "",
        sugarMgDl: f.sugar, sugarType: f.sugarType, notes: f.notes,
      },
      fallback: "Could not save vitals.",
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    const data = res.data;
    setResult({ level: data.level, alerts: data.alerts ?? [], doctorAlerted: !!data.doctorAlerted });
    setF({ systolic: "", diastolic: "", pulse: "", spo2: "", tempF: "", sugar: "", sugarType: "RANDOM", notes: "" });
    setOpen(false);
    onSaved();
  };
  const field = (k: keyof typeof f, label: string, ph: string, w = "") => (
    <label className={cn("block", w)}>
      <span className="text-[11px] text-slate-500">{label}</span>
      <input inputMode="decimal" className="input-field py-1.5 text-sm" placeholder={ph} value={f[k]} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ""))} />
    </label>
  );

  return (
    <div className="rounded-xl border border-slate-200 p-3 mb-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Activity className="w-4 h-4 text-rose-500" />Vitals</p>
        {!open && <button type="button" onClick={() => { setOpen(true); setResult(null); }} className="text-xs font-semibold text-blue-600">+ Record</button>}
      </div>
      {previous && (
        <p className="text-[11px] text-slate-500 mt-1">Previous ({new Date(previous.recordedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}): {vitalsSummary(previous)}</p>
      )}
      {visit.vitals.map((r) => (
        <p key={r.id} className={cn("text-xs mt-1", r.alertLevel === "CRITICAL" ? "text-red-700 font-semibold" : r.alertLevel === "WARNING" ? "text-amber-800" : "text-slate-600")}>
          {r.alertLevel !== "NORMAL" && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          {new Date(r.recordedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}: {vitalsSummary(r)}
        </p>
      ))}
      {result?.level === "CRITICAL" && (
        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Critical reading</p>
          {result.alerts.filter((a) => a.level === "CRITICAL").map((a, i) => <p key={i}>• {a.message}</p>)}
          <p className="mt-1">Recheck once. If it stays like this, contact the patient&apos;s doctor now. Chest pain, breathing difficulty, fainting or confusion → call <strong>108</strong> immediately.</p>
          <p className="mt-1 font-semibold">{result.doctorAlerted ? "The referring doctor and the patient have been alerted." : "The patient's family has been alerted."}</p>
        </div>
      )}
      {result?.level === "WARNING" && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Out of normal range</p>
          {result.alerts.map((a, i) => <p key={i}>• {a.message}</p>)}
          <p className="mt-0.5">Mention it in your visit notes.</p>
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {field("systolic", "BP upper", "120")}
            {field("diastolic", "BP lower", "80")}
            {field("pulse", "Pulse /min", "76")}
            {field("spo2", "SpO2 %", "98")}
            {field("tempF", "Temp °F", "98.6")}
            {field("sugar", "Sugar mg/dL", "110")}
          </div>
          {f.sugar && (
            <div className="flex gap-1.5">
              {SUGAR_TYPES.map((t) => (
                <button key={t.id} type="button" onClick={() => set("sugarType", t.id)}
                  className={cn("flex-1 py-1.5 rounded-lg border text-[11px] font-semibold", f.sugarType === t.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {f.tempF && Number(f.tempF) > 0 && Number(f.tempF) < 50 && (
            <p className="text-[11px] text-amber-700">That looks like °C — enter °F (e.g. 98.6). {f.tempF}°C = {cToF(Number(f.tempF))}°F</p>
          )}
          <input className="input-field py-1.5 text-sm" placeholder="Notes (optional)" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            {visit.vitals.length > 0 && <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center py-2 text-xs">Cancel</button>}
            <button type="button" disabled={busy} onClick={save} className="btn-primary flex-1 justify-center py-2 text-xs">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save vitals"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// At the door: the patient reads out the 4-digit code from their app. If
// they truly can't, the nurse may start anyway — with a reason, which the
// patient and the admin both see.
function StartVisitBox({ visitId, scheduledAt, onStarted }: { visitId: string; scheduledAt: string; onStarted: () => void }) {
  const [code, setCode] = useState("");
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (payload: Record<string, string>) => {
    setBusy(true); setError("");
    // Not mutate(): a failure's `code` (OTP_LOCKED) matters here.
    let res: Response;
    try {
      res = await fetch(`/api/appointments/${visitId}/start-visit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
    } catch {
      setBusy(false);
      setError("Network error — check your connection and try again.");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not start the visit.");
      if (data.code === "OTP_LOCKED") setSkipping(true);
      return;
    }
    onStarted();
  };

  const outsideWindow = visitStartProblem(new Date(scheduledAt));
  if (outsideWindow) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-600 flex items-center gap-1.5"><Clock className="w-4 h-4 text-slate-400 shrink-0" />{outsideWindow}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
      {!skipping ? (
        <>
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><KeyRound className="w-4 h-4 text-rose-500" />Ask the patient for their visit code</p>
          <div className="flex gap-2 mt-2">
            <input
              inputMode="numeric" maxLength={4} autoComplete="one-time-code" placeholder="4-digit code"
              className="input-field text-center text-lg font-bold tracking-[0.4em] flex-1"
              value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }}
            />
            <button disabled={busy || code.length !== 4} onClick={() => send({ code })} className="btn-primary px-4 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start visit"}
            </button>
          </div>
          <button type="button" onClick={() => { setSkipping(true); setError(""); }} className="text-xs font-semibold text-slate-500 mt-2 underline">
            Patient can&apos;t share the code?
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-800">Start without the code</p>
          <p className="text-[11px] text-slate-500">Tell us why — the patient and DocOnClick will be notified.</p>
          <textarea rows={2} className="input-field mt-2 text-sm" placeholder="e.g. Elderly patient alone at home, son not reachable on phone" value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }} />
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => { setSkipping(false); setError(""); }} className="btn-secondary flex-1 justify-center py-2 text-xs">Back</button>
            <button disabled={busy || reason.trim().length < 10} onClick={() => send({ skipReason: reason })} className="btn-primary flex-1 justify-center py-2 text-xs disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start without code"}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

export default function NurseDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("requests");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [completeTarget, setCompleteTarget] = useState<Visit | null>(null);
  const [visitNotes, setVisitNotes] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Visit | null>(null);
  // "Start journey" / "Stop journey" both notify the patient — confirm first.
  const [journeyConfirm, setJourneyConfirm] = useState<{ visit: Visit; action: "start" | "stop" } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/nurse/dashboard");
  }, [authLoading, user, router]);

  // Visits poll every 10s; a failed poll keeps the last list on screen.
  const isNurse = !!user && user.role === "NURSE";
  const visitsLoad = useLoad<Visit[]>(isNurse ? "/api/appointments/me" : null, { pollMs: 10000, fallback: "Couldn't load your visits." });
  const profileLoad = useLoad<{ nurseProfile: { status: string }; bookable: boolean }>(isNurse ? "/api/nurses/me" : null, { fallback: "Couldn't load your profile status." });
  const visits = visitsLoad.data;
  const load = visitsLoad.reload;
  const profileStatus = profileLoad.data ? { status: profileLoad.data.nurseProfile.status, bookable: profileLoad.data.bookable } : null;
  const loadError = visitsLoad.error ?? profileLoad.error;
  const retryLoad = () => { void visitsLoad.reload(); if (profileLoad.error) void profileLoad.reload(); };

  // ── Live journey tracking ──
  // The watcher itself lives in JourneyTracker (the nurse layout), so it
  // survives leaving this page and resumes after a reload.
  const journey = useJourneyTracker();
  const sendPosition = (id: string, travelStatus: "NOT_STARTED" | "ON_THE_WAY" | "ARRIVED", fallback: string, lat?: number, lng?: number) =>
    mutate(`/api/appointments/${id}/travel`, {
      method: "PATCH",
      body: { travelStatus, ...(lat != null && lng != null ? { lat, lng } : {}) },
      fallback,
    });

  // The inline error sits above the list (often scrolled off, or behind a
  // dialog) — toast it too.
  const fail = (msg: string) => { setError(msg); toast.error(msg); };

  const startJourney = async (id: string) => {
    setBusyId(id); setError("");
    try {
      const pos = await getCurrentPositionCompat({ enableHighAccuracy: true });
      // mutate() never throws — the catch below is only for location access.
      const res = await sendPosition(id, "ON_THE_WAY", "Could not start the journey.", pos.coords.latitude, pos.coords.longitude);
      if (!res.ok) { fail(res.error); return false; }
      await journey.track(id, { justSent: true });
      return true;
    } catch {
      fail("Location access is needed to share your journey with the patient.");
      return false;
    } finally {
      setBusyId(null);
      load();
    }
  };

  // Back to "not started" — e.g. tapped by mistake, or turned back.
  const stopJourney = async (id: string) => {
    setBusyId(id); setError("");
    await journey.stop();
    const res = await sendPosition(id, "NOT_STARTED", "Could not stop the journey.");
    if (!res.ok) fail(res.error);
    setBusyId(null);
    load();
    return res.ok;
  };

  const markArrived = async (id: string) => {
    setBusyId(id); setError("");
    await journey.stop();
    const res = await sendPosition(id, "ARRIVED", "Could not update.");
    if (!res.ok) fail(res.error);
    setBusyId(null);
    load();
  };

  const setStatus = async (id: string, status: string, doctorNotes?: string) => {
    setBusyId(id); setError("");
    const res = await mutate(`/api/appointments/${id}`, {
      method: "PATCH",
      body: { status, ...(doctorNotes !== undefined ? { doctorNotes } : {}) },
      fallback: "Could not update this visit.",
    });
    if (!res.ok) fail(res.error);
    setBusyId(null);
    load();
    return res.ok;
  };

  if (authLoading || !user || (visits === null && !visitsLoad.error)) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-rose-500" /></div>;
  }

  // First load failed — nothing to show yet.
  if (visits === null) {
    return (
      <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
        <NurseHeader />
        <NurseMobileNav />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-extrabold text-slate-900 mb-4">My Visits</h1>
          <LoadError error={visitsLoad.error!} onRetry={retryLoad} retrying={visitsLoad.reloading} />
        </div>
      </div>
    );
  }

  // A package is one request: show its first pending visit, with the rest listed on the card.
  const pendingAll = visits.filter((v) => v.status === "PENDING_APPROVAL");
  const packageSessions = (pkgId: string) =>
    visits.filter((x) => x.packageId === pkgId && x.status === "PENDING_APPROVAL")
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const requests = pendingAll.filter((v) => !v.packageId || packageSessions(v.packageId)[0]?.id === v.id);
  const upcoming = visits
    .filter((v) => v.status === "SCHEDULED")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const history = visits.filter((v) => !["PENDING_APPROVAL", "SCHEDULED"].includes(v.status));
  const list = tab === "requests" ? requests : tab === "upcoming" ? upcoming : history;
  const counts = { requests: requests.length, upcoming: upcoming.length, history: history.length };

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <NurseHeader />
      <NurseMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-2xl font-extrabold text-slate-900 mb-4">My Visits</h1>

        {loadError && <LoadError error={loadError} onRetry={retryLoad} retrying={visitsLoad.reloading || profileLoad.reloading} hasData />}

        {profileStatus && !profileStatus.bookable && (
          <Link href="/nurse/profile" className="block rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-sm text-amber-800">
            <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />
              {profileStatus.status === "APPROVED" ? "Patients can't book you yet" : profileStatus.status === "SUSPENDED" ? "Account suspended" : profileStatus.status === "REJECTED" ? "Application not approved" : "Waiting for admin approval"}
            </p>
            <p className="mt-0.5">
              {profileStatus.status === "APPROVED" ? "Pay the pending platform fee in your profile." : "Complete your profile, documents and services — then the admin will review it."} →
            </p>
          </Link>
        )}

        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 px-2 py-2 rounded-full text-sm font-semibold border whitespace-nowrap transition-colors",
                tab === t.id ? "bg-rose-600 text-white border-rose-600" : "bg-white text-slate-600 border-slate-200"
              )}
            >
              {t.label}{counts[t.id] > 0 && ` (${counts[t.id]})`}
            </button>
          ))}
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-4">{error}</div>}

        {list.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-sm text-slate-400">
            {tab === "requests" ? "No new requests right now." : tab === "upcoming" ? "No upcoming visits." : "No past visits yet."}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((v) => {
              const dir = directionsUrl(v);
              const busy = busyId === v.id;
              const earning = Math.round((v.amount - v.platformFee) * 100) / 100;
              const paid = v.paymentStatus === "PAID";
              const shiftWait = v.nurseService?.kind === "SHIFT" && v.visitStartedAt ? shiftCompleteProblem(new Date(v.visitStartedAt), v.nurseService.durationMinutes) : null;
              return (
                <div key={v.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 flex items-center gap-1.5"><UserIcon className="w-4 h-4 text-slate-400" />{patientLabel(v)}</p>
                      {v.relation !== "Self" && <p className="text-xs text-slate-400">{v.relation} of {v.patient.name}</p>}
                      {ageGender(v) && <p className="text-xs text-slate-500">{ageGender(v)}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-slate-900">₹{v.amount}</p>
                      <p className="text-[11px] text-slate-400">You get ₹{earning}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2">
                    <p className="text-sm font-semibold text-rose-700 flex items-center justify-between gap-2">
                      <span>{v.serviceName ?? "Nursing visit"}</span>
                      {v.package && v.packageIndex && v.status !== "PENDING_APPROVAL" && (
                        <span className="text-[11px] font-bold text-rose-600 bg-white rounded-full px-2 py-0.5 flex-shrink-0">Visit {v.packageIndex} of {v.package.visits}</span>
                      )}
                    </p>
                    {v.symptoms && v.symptoms !== v.serviceName && <p className="text-xs text-rose-900/70 mt-0.5">{v.symptoms}</p>}
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                    <p className="flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-slate-400" />
                      {new Date(v.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                      {v.nurseService?.kind === "SHIFT" && (
                        <span className="font-semibold text-slate-700">
                          → {new Date(new Date(v.scheduledAt).getTime() + v.nurseService.durationMinutes * 60000).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                          {" "}({Math.round(v.nurseService.durationMinutes / 60)}-hour shift)
                        </span>
                      )}
                    </p>
                    {v.visit?.address && (
                      <p className="flex items-start gap-1.5"><MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span>{v.visit.address}{v.visit.landmark ? `, ${v.visit.landmark}` : ""}{v.visit.pinCode ? ` — ${v.visit.pinCode}` : ""}</span>
                      </p>
                    )}
                    {v.allergies && <p className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="w-4 h-4" />Allergies: {v.allergies}</p>}
                    {v.prescriptionDoc && (
                      <a href={v.prescriptionDoc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-600 font-semibold hover:underline">
                        <FileText className="w-4 h-4" />Doctor&apos;s prescription: {v.prescriptionDoc.title}
                      </a>
                    )}
                  </div>

                  {v.status === "PENDING_APPROVAL" && v.packageId && v.package && (() => {
                    const sessions = packageSessions(v.packageId);
                    return (
                      <div className="mt-3 rounded-xl border border-rose-200 px-3 py-2.5">
                        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Layers className="w-4 h-4 text-rose-500" />Package · {sessions.length} visits · {intervalLabel(v.package.intervalDays)}</p>
                        <ol className="text-xs text-slate-600 mt-1 space-y-0.5 list-decimal list-inside">
                          {sessions.map((x) => <li key={x.id}>{new Date(x.scheduledAt).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</li>)}
                        </ol>
                        <p className="text-xs text-emerald-700 font-semibold mt-1.5">You get ₹{Math.round(earning * sessions.length * 100) / 100} for the package</p>
                        <p className="text-[11px] text-slate-400">Accepting confirms every visit above.</p>
                      </div>
                    );
                  })()}

                  {v.nurseReferral && (
                    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-xs text-slate-700">
                      <p className="font-semibold text-blue-800 flex items-center gap-1.5"><Stethoscope className="w-3.5 h-3.5" />Referred by Dr. {v.nurseReferral.appointment.doctor.name.replace(/^dr\.?\s*/i, "")} · {new Date(v.nurseReferral.appointment.scheduledAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
                      {v.nurseReferral.instructions && <p className="mt-1">Instructions: {v.nurseReferral.instructions}</p>}
                      {v.nurseReferral.appointment.medicines.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {v.nurseReferral.appointment.medicines.map((m, i) => (
                            <li key={i}>• <strong>{m.name}</strong> {[m.dosage, m.frequency, m.duration].filter(Boolean).join(" · ")}{m.instructions ? ` — ${m.instructions}` : ""}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {v.status === "PENDING_APPROVAL" && (
                    <div className="flex gap-2 mt-4">
                      <button disabled={busy} onClick={() => setStatus(v.id, "REJECTED")} className="btn-secondary flex-1 justify-center py-2.5 text-sm">
                        <XCircle className="w-4 h-4" /> Decline
                      </button>
                      <button disabled={busy} onClick={() => setStatus(v.id, "SCHEDULED")} className="btn-primary flex-1 justify-center py-2.5 text-sm">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Accept
                      </button>
                    </div>
                  )}

                  {v.status === "SCHEDULED" && (
                    <>
                      {v.requestedScheduledAt && (
                        <RescheduleRequestBox appointmentId={v.id} requestedAt={v.requestedScheduledAt} onDone={load} />
                      )}
                      <div className={cn("mt-4 rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5", paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                        <IndianRupee className="w-3.5 h-3.5" />
                        {paid ? "Patient has paid" : "Waiting for the patient's payment — you can complete the visit once it's paid"}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <a href={`tel:${v.patient.mobile}`} className="btn-secondary justify-center py-2 text-xs"><Phone className="w-4 h-4" /> Call</a>
                        <Link href={`/nurse/chat/${v.id}`} className="btn-secondary justify-center py-2 text-xs relative">
                          <MessageCircle className="w-4 h-4" /> Chat
                          {v.unreadMessageCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{v.unreadMessageCount}</span>}
                        </Link>
                        {dir ? (
                          <a href={dir} target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center py-2 text-xs"><Navigation className="w-4 h-4" /> Map</a>
                        ) : <span />}
                      </div>
                      <div className="mt-3">
                        {v.travelStatus === "NOT_STARTED" && (
                          <button disabled={busy} onClick={() => setJourneyConfirm({ visit: v, action: "start" })} className="btn-primary w-full justify-center py-2.5 text-sm">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />} Start journey
                          </button>
                        )}
                        {v.travelStatus === "ON_THE_WAY" && (
                          <button disabled={busy} onClick={() => markArrived(v.id)} className="btn-primary w-full justify-center py-2.5 text-sm">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />} I&apos;ve arrived
                          </button>
                        )}
                        {v.travelStatus === "ON_THE_WAY" && (
                          <button disabled={busy} onClick={() => setJourneyConfirm({ visit: v, action: "stop" })} className="w-full text-xs font-semibold text-slate-500 mt-2 py-1 hover:text-slate-700">
                            Stop journey
                          </button>
                        )}
                        {v.travelStatus === "ARRIVED" && !v.visitStartedAt && (
                          <StartVisitBox visitId={v.id} scheduledAt={v.scheduledAt} onStarted={load} />
                        )}
                        {v.travelStatus === "ARRIVED" && v.visitStartedAt && (
                          <RecordVitalsBox visit={v} onSaved={load} />
                        )}
                        {v.travelStatus === "ARRIVED" && shiftWait && (
                          <p className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />{shiftWait}</p>
                        )}
                        {v.travelStatus === "ARRIVED" && v.visitStartedAt && (
                          <button
                            disabled={busy || !paid || !!shiftWait}
                            onClick={() => { setVisitNotes(""); setCompleteTarget(v); }}
                            className="btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Complete visit
                          </button>
                        )}
                        <button onClick={() => setCancelTarget(v)} className="w-full text-xs font-semibold text-red-500 mt-2 py-1">
                          Can&apos;t make it? Cancel visit
                        </button>
                      </div>
                    </>
                  )}

                  {!["PENDING_APPROVAL", "SCHEDULED"].includes(v.status) && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={cn("badge", v.status === "COMPLETED" ? "badge-success" : "badge-gray")}>{STATUS_LABEL[v.status] ?? v.status}</span>
                      <div className="flex items-center gap-3">
                        {v.review && <span className="text-xs text-amber-600 font-semibold flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{v.review.rating}/5</span>}
                        {/* Readable after the visit; open for follow-up questions for a few days. */}
                        {v.status === "COMPLETED" && (
                          <Link href={`/nurse/chat/${v.id}`} className="relative text-xs font-semibold text-rose-600 flex items-center gap-1 hover:underline">
                            <MessageCircle className="w-3.5 h-3.5" /> Chat
                            {v.unreadMessageCount > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{v.unreadMessageCount}</span>}
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                  {v.status === "COMPLETED" && v.doctorNotes && <p className="text-xs text-slate-500 mt-2">Notes: {v.doctorNotes}</p>}
                  {v.status === "PENDING_APPROVAL" && (
                    <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" />Requested {new Date(v.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {completeTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-800 mb-1">Complete this visit</h3>
            <p className="text-sm text-slate-500 mb-3">{completeTarget.serviceName} for {patientLabel(completeTarget)}</p>
            <label className="input-label">Visit notes (optional)</label>
            <textarea rows={3} className="input-field" placeholder="What was done, vitals, advice…" value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setCompleteTarget(null)} className="btn-secondary flex-1">Back</button>
              <button
                disabled={busyId === completeTarget.id}
                onClick={async () => { if (await setStatus(completeTarget.id, "COMPLETED", visitNotes.trim() || undefined)) setCompleteTarget(null); }}
                className="btn-primary flex-1 justify-center"
              >
                {busyId === completeTarget.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Mark complete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {journeyConfirm && (
        <ConfirmDialog
          icon={Car}
          tone={journeyConfirm.action === "start" ? "primary" : "warning"}
          title={journeyConfirm.action === "start" ? `Start your journey to ${patientLabel(journeyConfirm.visit)}?` : "Stop the journey?"}
          message={journeyConfirm.action === "start"
            ? "The patient will be told you're on the way and can follow your live location until you arrive."
            : "Your live location stops being shared and the patient is told you're not on the way right now. You can start again later."}
          confirmLabel={journeyConfirm.action === "start" ? "Start journey" : "Stop journey"}
          busyLabel={journeyConfirm.action === "start" ? "Starting…" : "Stopping…"}
          busy={busyId === journeyConfirm.visit.id}
          onCancel={() => setJourneyConfirm(null)}
          onConfirm={async () => {
            const { visit, action } = journeyConfirm;
            // Stays open on failure so it can be retried.
            const ok = action === "start" ? await startJourney(visit.id) : await stopJourney(visit.id);
            if (ok) setJourneyConfirm(null);
          }}
        />
      )}

      {cancelTarget && (
        <ConfirmDialog
          icon={AlertTriangle}
          tone="danger"
          title="Cancel this visit?"
          message={cancelTarget.paymentStatus === "PAID"
            ? "The patient will get a full refund to their wallet. Only cancel if it's an emergency."
            : "The patient will be told you can't make it. Only cancel if it's an emergency."}
          confirmLabel="Cancel visit"
          busyLabel="Cancelling…"
          busy={busyId === cancelTarget.id}
          onCancel={() => setCancelTarget(null)}
          onConfirm={async () => { if (await setStatus(cancelTarget.id, "CANCELLED")) setCancelTarget(null); }}
        />
      )}
    </div>
  );
}
