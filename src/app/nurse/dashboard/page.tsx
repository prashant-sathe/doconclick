"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Loader2, Clock, MapPin, Navigation, Phone, MessageCircle, FileText, CheckCircle2, XCircle,
  Car, Flag, AlertTriangle, IndianRupee, User as UserIcon, CalendarClock, Star, KeyRound, Layers, Stethoscope, Activity,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { NurseHeader, NurseMobileNav } from "@/components/nurse/NurseNav";
import { OfflineToggle } from "@/components/ProviderAway";
import UnpaidJourneyWarning, { type UnpaidStart } from "@/components/UnpaidJourneyWarning";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import RescheduleRequestBox from "@/components/RescheduleRequestBox";
import { getCurrentPositionCompat } from "@/lib/platform";
import { useJourneyTracker } from "@/components/JourneyTracker";
import { useAppointmentFeed, useAppointmentHistory, mergeAppointments } from "@/components/AppointmentFeed";
import { cn } from "@/lib/utils";
import { mutate, useLoad } from "@/lib/apiClient";
import { VISIT_START_EARLY_MS, VISIT_START_LATE_MS, shiftCompletableAt } from "@/lib/nursePackage";
import { SUGAR_TYPES, fToC, cToF, type VitalsInput } from "@/lib/vitals";
import { formattingLocale } from "@/lib/appLanguage";

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

// Labels are message keys (messages/<locale>/nurse.json).
const TABS = ["requests", "upcoming", "history"] as const;
const STATUSES = ["COMPLETED", "CANCELLED", "REJECTED", "EXPIRED", "NO_SHOW"] as const;
const RELATIONS = ["Self", "Spouse", "Son", "Daughter", "Father", "Mother", "Other"] as const;
const GENDER_KEYS = ["Male", "Female", "Other"] as const;
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

type CommonT = ReturnType<typeof useTranslations<"nurse.common">>;
type DashT = ReturnType<typeof useTranslations<"nurse.dashboard">>;

function patientLabel(v: Visit) {
  return v.relation !== "Self" && v.patientName ? v.patientName : v.patient.name;
}

const relationLabel = (relation: string, tc: CommonT) => (isOneOf(RELATIONS, relation) ? tc(`relation.${relation}`) : relation);

function ageGender(v: Visit, t: DashT, tc: CommonT) {
  const age = v.relation !== "Self" ? v.dependent?.age : v.patient.patientProfile?.age;
  const gender = v.relation !== "Self" ? v.dependent?.gender : v.patient.patientProfile?.gender;
  const genderLabel = gender ? (isOneOf(GENDER_KEYS, gender) ? tc(`gender.${gender}`) : gender) : null;
  return [age ? t("ageYears", { age }) : null, genderLabel].filter(Boolean).join(" · ");
}

// Same windows as visitStartProblem / shiftCompleteProblem (src/lib/nursePackage.ts),
// worded in the app's language.
const fmtTimeIST = (d: Date, locale: string) =>
  d.toLocaleString(locale, { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function startWindowProblem(scheduledAt: Date, t: DashT, locale: string, now = new Date()): string | null {
  const at = scheduledAt.getTime();
  if (now.getTime() < at - VISIT_START_EARLY_MS) {
    return t("startEarly", { at: fmtTimeIST(scheduledAt, locale), from: fmtTimeIST(new Date(at - VISIT_START_EARLY_MS), locale) });
  }
  if (now.getTime() > at + VISIT_START_LATE_MS) return t("startLate");
  return null;
}

function shiftWaitProblem(visitStartedAt: Date, durationMinutes: number, t: DashT, locale: string, now = new Date()): string | null {
  const ready = shiftCompletableAt(visitStartedAt, durationMinutes);
  if (now.getTime() >= ready.getTime()) return null;
  return t("shiftWait", { hours: Math.round(durationMinutes / 60), at: fmtTimeIST(ready, locale) });
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
  const t = useTranslations("nurse.vitals");
  const tc = useTranslations("nurse.common");
  const locale = formattingLocale(useLocale());
  const summary = (v: VitalsInput) => {
    const parts: string[] = [];
    if (v.systolic != null && v.diastolic != null) parts.push(t("summary.bp", { systolic: v.systolic, diastolic: v.diastolic }));
    if (v.pulse != null) parts.push(t("summary.pulse", { value: v.pulse }));
    if (v.spo2 != null) parts.push(t("summary.spo2", { value: v.spo2 }));
    if (v.temperatureC != null) parts.push(t("summary.temp", { value: cToF(v.temperatureC) }));
    if (v.sugarMgDl != null) parts.push(t("summary.sugar", { value: v.sugarMgDl }));
    return parts.join(" · ");
  };
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
      fallback: t("saveFailed"),
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
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Activity className="w-4 h-4 text-rose-500" />{t("title")}</p>
        {!open && <button type="button" onClick={() => { setOpen(true); setResult(null); }} className="text-xs font-semibold text-blue-600">{t("record")}</button>}
      </div>
      {previous && (
        <p className="text-[11px] text-slate-500 mt-1">{t("previous", { date: new Date(previous.recordedAt).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }), summary: summary(previous) })}</p>
      )}
      {visit.vitals.map((r) => (
        <p key={r.id} className={cn("text-xs mt-1", r.alertLevel === "CRITICAL" ? "text-red-700 font-semibold" : r.alertLevel === "WARNING" ? "text-amber-800" : "text-slate-600")}>
          {r.alertLevel !== "NORMAL" && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          {new Date(r.recordedAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}: {summary(r)}
        </p>
      ))}
      {result?.level === "CRITICAL" && (
        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{t("criticalTitle")}</p>
          {result.alerts.filter((a) => a.level === "CRITICAL").map((a, i) => <p key={i}>• {a.message}</p>)}
          <p className="mt-1">{t.rich("criticalAdvice", { b: (c) => <strong>{c}</strong> })}</p>
          <p className="mt-1 font-semibold">{result.doctorAlerted ? t("doctorAlerted") : t("familyAlerted")}</p>
        </div>
      )}
      {result?.level === "WARNING" && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">{t("warningTitle")}</p>
          {result.alerts.map((a, i) => <p key={i}>• {a.message}</p>)}
          <p className="mt-0.5">{t("warningNote")}</p>
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {field("systolic", t("field.systolic"), "120")}
            {field("diastolic", t("field.diastolic"), "80")}
            {field("pulse", t("field.pulse"), "76")}
            {field("spo2", t("field.spo2"), "98")}
            {field("tempF", t("field.temp"), "98.6")}
            {field("sugar", t("field.sugar"), "110")}
          </div>
          {f.sugar && (
            <div className="flex gap-1.5">
              {SUGAR_TYPES.map((st) => (
                <button key={st.id} type="button" onClick={() => set("sugarType", st.id)}
                  className={cn("flex-1 py-1.5 rounded-lg border text-[11px] font-semibold", f.sugarType === st.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                  {t(`sugarType.${st.id}`)}
                </button>
              ))}
            </div>
          )}
          {f.tempF && Number(f.tempF) > 0 && Number(f.tempF) < 50 && (
            <p className="text-[11px] text-amber-700">{t("looksCelsius", { c: f.tempF, f: cToF(Number(f.tempF)) })}</p>
          )}
          <input className="input-field py-1.5 text-sm" placeholder={t("notesPlaceholder")} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            {visit.vitals.length > 0 && <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center py-2 text-xs">{tc("cancel")}</button>}
            <button type="button" disabled={busy} onClick={save} className="btn-primary flex-1 justify-center py-2 text-xs">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("save")}
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
  const t = useTranslations("nurse.startVisit");
  const tc = useTranslations("nurse.common");
  const td = useTranslations("nurse.dashboard");
  const locale = formattingLocale(useLocale());
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
      setError(tc("networkError"));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? t("failed"));
      if (data.code === "OTP_LOCKED") setSkipping(true);
      return;
    }
    onStarted();
  };

  const outsideWindow = startWindowProblem(new Date(scheduledAt), td, locale);
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
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><KeyRound className="w-4 h-4 text-rose-500" />{t("askCode")}</p>
          <div className="flex gap-2 mt-2">
            <input
              inputMode="numeric" maxLength={4} autoComplete="one-time-code" placeholder={t("codePlaceholder")}
              className="input-field text-center text-lg font-bold tracking-[0.4em] flex-1"
              value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }}
            />
            <button disabled={busy || code.length !== 4} onClick={() => send({ code })} className="btn-primary px-4 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("start")}
            </button>
          </div>
          <button type="button" onClick={() => { setSkipping(true); setError(""); }} className="text-xs font-semibold text-slate-500 mt-2 underline">
            {t("cantShare")}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-800">{t("withoutTitle")}</p>
          <p className="text-[11px] text-slate-500">{t("withoutHint")}</p>
          <textarea rows={2} className="input-field mt-2 text-sm" placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }} />
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => { setSkipping(false); setError(""); }} className="btn-secondary flex-1 justify-center py-2 text-xs">{tc("back")}</button>
            <button disabled={busy || reason.trim().length < 10} onClick={() => send({ skipReason: reason })} className="btn-primary flex-1 justify-center py-2 text-xs disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("startWithout")}
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
  const t = useTranslations("nurse.dashboard");
  const tc = useTranslations("nurse.common");
  const locale = formattingLocale(useLocale());
  const [tab, setTab] = useState<(typeof TABS)[number]>("requests");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [completeTarget, setCompleteTarget] = useState<Visit | null>(null);
  const [visitNotes, setVisitNotes] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Visit | null>(null);
  // "Start journey" / "Stop journey" both notify the patient — confirm first.
  const [journeyConfirm, setJourneyConfirm] = useState<{ visit: Visit; action: "start" | "stop" } | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const remindToPay = async (v: Visit) => {
    setRemindingId(v.id);
    const r = await mutate(`/api/appointments/${v.id}/pay-reminder`, { method: "POST" });
    setRemindingId(null);
    if (r.ok) toast.success(t("remindedToPay", { name: patientLabel(v) }));
    else toast.warning(r.error);
  };
  // Setting off for an unpaid visit — the server refused and reminded the patient.
  const [unpaidStart, setUnpaidStart] = useState<UnpaidStart | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/nurse/dashboard");
  }, [authLoading, user, router]);

  // Live + recent visits come from the layout's shared 5s poll (the header's
  // request bell reads the same one); older history is paged in on demand.
  // A failed poll keeps the last list on screen.
  const isNurse = user?.role === "NURSE";
  const feed = useAppointmentFeed<Visit>();
  const past = useAppointmentHistory<Visit>(isNurse);
  const profileLoad = useLoad<{ nurseProfile: { status: string }; bookable: boolean }>(isNurse ? "/api/nurses/me" : null, { fallback: t("loadProfileFailed") });
  const visits = useMemo(() => (feed.items ? mergeAppointments(feed.items, past.items) : null), [feed.items, past.items]);
  const visitsError = feed.error ?? past.error;
  const load = () => Promise.all([feed.refresh(), past.refresh()]);
  const [retrying, setRetrying] = useState(false);
  const profileStatus = profileLoad.data ? { status: profileLoad.data.nurseProfile.status, bookable: profileLoad.data.bookable } : null;
  const loadError = visitsError ?? profileLoad.error;
  const retryLoad = async () => {
    setRetrying(true);
    if (profileLoad.error) void profileLoad.reload();
    await load();
    setRetrying(false);
  };

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

  const startJourney = async (id: string, acknowledgeUnpaid = false) => {
    setBusyId(id); setError("");
    try {
      const pos = await getCurrentPositionCompat({ enableHighAccuracy: true });
      const res = await fetch(`/api/appointments/${id}/travel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelStatus: "ON_THE_WAY", lat: pos.coords.latitude, lng: pos.coords.longitude, acknowledgeUnpaid }),
      }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      if (res?.status === 409 && body.code === "UNPAID_VISIT") {
        const v = (visits ?? []).find((x) => x.id === id);
        setUnpaidStart({ id, patientName: v ? patientLabel(v) : t("patientFallback"), amount: body.amount, reminderSent: body.reminderSent, reminderSentAt: body.reminderSentAt });
        return "unpaid" as const;
      }
      if (!res?.ok) { fail(body.error ?? (res ? t("startJourneyFailed") : tc("networkError"))); return false; }
      setUnpaidStart(null);
      await journey.track(id, { justSent: true });
      return true;
    } catch {
      fail(t("locationNeeded"));
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
    const res = await sendPosition(id, "NOT_STARTED", t("stopJourneyFailed"));
    if (!res.ok) fail(res.error);
    setBusyId(null);
    load();
    return res.ok;
  };

  const markArrived = async (id: string) => {
    setBusyId(id); setError("");
    await journey.stop();
    const res = await sendPosition(id, "ARRIVED", t("updateFailed"));
    if (!res.ok) fail(res.error);
    setBusyId(null);
    load();
  };

  const setStatus = async (id: string, status: string, doctorNotes?: string) => {
    setBusyId(id); setError("");
    const res = await mutate(`/api/appointments/${id}`, {
      method: "PATCH",
      body: { status, ...(doctorNotes !== undefined ? { doctorNotes } : {}) },
      fallback: t("updateVisitFailed"),
    });
    if (!res.ok) fail(res.error);
    setBusyId(null);
    load();
    return res.ok;
  };

  if (authLoading || !user || (visits === null && !visitsError)) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-rose-500" /></div>;
  }

  // First load failed — nothing to show yet.
  if (visits === null) {
    return (
      <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
        <NurseHeader />
        <NurseMobileNav />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-extrabold text-slate-900 mb-4">{t("title")}</h1>
          <LoadError error={visitsError!} onRetry={retryLoad} retrying={retrying} />
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
  const history = visits
    .filter((v) => !["PENDING_APPROVAL", "SCHEDULED"].includes(v.status))
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  const list = tab === "requests" ? requests : tab === "upcoming" ? upcoming : history;
  // History is paged, so its tab shows the server's total, not what's loaded.
  const historyTotal = Math.max(history.length, Object.values(past.counts).reduce((sum, n) => sum + n, 0));
  const counts = { requests: requests.length, upcoming: upcoming.length, history: historyTotal };

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <NurseHeader />
      <NurseMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-2xl font-extrabold text-slate-900 mb-4">{t("title")}</h1>

        <OfflineToggle timeOffHref="/nurse/profile#time-off" onChanged={() => { void retryLoad(); }} />

        {loadError && <LoadError error={loadError} onRetry={retryLoad} retrying={retrying || profileLoad.reloading} hasData />}

        {profileStatus && !profileStatus.bookable && (
          <Link href="/nurse/profile" className="block rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-sm text-amber-800">
            <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />
              {profileStatus.status === "APPROVED" ? t("banner.notBookable") : profileStatus.status === "SUSPENDED" ? t("banner.suspended") : profileStatus.status === "REJECTED" ? t("banner.rejected") : t("banner.waiting")}
            </p>
            <p className="mt-0.5">
              {profileStatus.status === "APPROVED" ? t("banner.payFee") : t("banner.completeProfile")} →
            </p>
          </Link>
        )}

        <div className="flex gap-2 mb-4">
          {TABS.map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 px-2 py-2 rounded-full text-sm font-semibold border whitespace-nowrap transition-colors",
                tab === id ? "bg-rose-600 text-white border-rose-600" : "bg-white text-slate-600 border-slate-200"
              )}
            >
              {t(`tabs.${id}`)}{counts[id] > 0 && ` (${counts[id]})`}
            </button>
          ))}
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-4">{error}</div>}

        {list.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-sm text-slate-400">
            {t(`empty.${tab}`)}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((v) => {
              const dir = directionsUrl(v);
              const busy = busyId === v.id;
              const earning = Math.round((v.amount - v.platformFee) * 100) / 100;
              const paid = v.paymentStatus === "PAID";
              const shiftWait = v.nurseService?.kind === "SHIFT" && v.visitStartedAt ? shiftWaitProblem(new Date(v.visitStartedAt), v.nurseService.durationMinutes, t, locale) : null;
              return (
                <div key={v.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 flex items-center gap-1.5"><UserIcon className="w-4 h-4 text-slate-400" />{patientLabel(v)}</p>
                      {v.relation !== "Self" && <p className="text-xs text-slate-400">{tc("relationOf", { relation: relationLabel(v.relation, tc), name: v.patient.name })}</p>}
                      {ageGender(v, t, tc) && <p className="text-xs text-slate-500">{ageGender(v, t, tc)}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-slate-900">₹{v.amount}</p>
                      <p className="text-[11px] text-slate-400">{t("youGet", { amount: earning })}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2">
                    <p className="text-sm font-semibold text-rose-700 flex items-center justify-between gap-2">
                      <span>{v.serviceName ?? tc("nursingVisit")}</span>
                      {v.package && v.packageIndex && v.status !== "PENDING_APPROVAL" && (
                        <span className="text-[11px] font-bold text-rose-600 bg-white rounded-full px-2 py-0.5 flex-shrink-0">{t("visitOf", { index: v.packageIndex, total: v.package.visits })}</span>
                      )}
                    </p>
                    {v.symptoms && v.symptoms !== v.serviceName && <p className="text-xs text-rose-900/70 mt-0.5">{v.symptoms}</p>}
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                    <p className="flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-slate-400" />
                      {new Date(v.scheduledAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                      {v.nurseService?.kind === "SHIFT" && (
                        <span className="font-semibold text-slate-700">
                          → {new Date(new Date(v.scheduledAt).getTime() + v.nurseService.durationMinutes * 60000).toLocaleString(locale, { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                          {" "}{t("shiftHours", { hours: Math.round(v.nurseService.durationMinutes / 60) })}
                        </span>
                      )}
                    </p>
                    {v.visit?.address && (
                      <p className="flex items-start gap-1.5"><MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span>{v.visit.address}{v.visit.landmark ? `, ${v.visit.landmark}` : ""}{v.visit.pinCode ? ` — ${v.visit.pinCode}` : ""}</span>
                      </p>
                    )}
                    {v.allergies && <p className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="w-4 h-4" />{t("allergies", { list: v.allergies })}</p>}
                    {v.prescriptionDoc && (
                      <a href={v.prescriptionDoc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-600 font-semibold hover:underline">
                        <FileText className="w-4 h-4" />{t("prescription", { title: v.prescriptionDoc.title })}
                      </a>
                    )}
                  </div>

                  {v.status === "PENDING_APPROVAL" && v.packageId && v.package && (() => {
                    const sessions = packageSessions(v.packageId);
                    return (
                      <div className="mt-3 rounded-xl border border-rose-200 px-3 py-2.5">
                        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Layers className="w-4 h-4 text-rose-500" />{t("package", { count: sessions.length, interval: t("interval", { days: v.package.intervalDays }) })}</p>
                        <ol className="text-xs text-slate-600 mt-1 space-y-0.5 list-decimal list-inside">
                          {sessions.map((x) => <li key={x.id}>{new Date(x.scheduledAt).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</li>)}
                        </ol>
                        <p className="text-xs text-emerald-700 font-semibold mt-1.5">{t("packageEarning", { amount: Math.round(earning * sessions.length * 100) / 100 })}</p>
                        <p className="text-[11px] text-slate-400">{t("packageAcceptNote")}</p>
                      </div>
                    );
                  })()}

                  {v.nurseReferral && (
                    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-xs text-slate-700">
                      <p className="font-semibold text-blue-800 flex items-center gap-1.5"><Stethoscope className="w-3.5 h-3.5" />{t("referredBy", { name: v.nurseReferral.appointment.doctor.name.replace(/^dr\.?\s*/i, ""), date: new Date(v.nurseReferral.appointment.scheduledAt).toLocaleDateString(locale, { timeZone: "Asia/Kolkata" }) })}</p>
                      {v.nurseReferral.instructions && <p className="mt-1">{t("instructions", { text: v.nurseReferral.instructions })}</p>}
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
                        <XCircle className="w-4 h-4" /> {t("decline")}
                      </button>
                      <button disabled={busy} onClick={() => setStatus(v.id, "SCHEDULED")} className="btn-primary flex-1 justify-center py-2.5 text-sm">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {t("accept")}
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
                        <span className="flex-1">{paid ? t("paid") : t("awaitingPayment")}</span>
                        {!paid && (
                          <button type="button" onClick={() => remindToPay(v)} disabled={remindingId === v.id} className="flex-shrink-0 underline font-bold disabled:opacity-60">
                            {remindingId === v.id ? t("sending") : t("remind")}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <a href={`tel:${v.patient.mobile}`} className="btn-secondary justify-center py-2 text-xs"><Phone className="w-4 h-4" /> {t("call")}</a>
                        <Link href={`/nurse/chat/${v.id}`} className="btn-secondary justify-center py-2 text-xs relative">
                          <MessageCircle className="w-4 h-4" /> {t("chat")}
                          {v.unreadMessageCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{v.unreadMessageCount}</span>}
                        </Link>
                        {dir ? (
                          <a href={dir} target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center py-2 text-xs"><Navigation className="w-4 h-4" /> {t("map")}</a>
                        ) : <span />}
                      </div>
                      <div className="mt-3">
                        {v.travelStatus === "NOT_STARTED" && (
                          <button
                            disabled={busy}
                            // Unpaid: straight to the server, whose refusal (and the
                            // patient's pay reminder) brings up the unpaid warning instead.
                            onClick={() => (v.paymentStatus === "PAID" ? setJourneyConfirm({ visit: v, action: "start" }) : void startJourney(v.id))}
                            className={cn("w-full justify-center py-2.5 text-sm", v.paymentStatus === "PAID" ? "btn-primary" : "btn-secondary text-red-700 border-red-200")}
                          >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />} {t("startJourney")}
                          </button>
                        )}
                        {v.travelStatus === "ON_THE_WAY" && (
                          <button disabled={busy} onClick={() => markArrived(v.id)} className="btn-primary w-full justify-center py-2.5 text-sm">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />} {t("arrived")}
                          </button>
                        )}
                        {v.travelStatus === "ON_THE_WAY" && (
                          <button disabled={busy} onClick={() => setJourneyConfirm({ visit: v, action: "stop" })} className="w-full text-xs font-semibold text-slate-500 mt-2 py-1 hover:text-slate-700">
                            {t("stopJourney")}
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
                            <CheckCircle2 className="w-4 h-4" /> {t("completeVisit")}
                          </button>
                        )}
                        <button onClick={() => setCancelTarget(v)} className="w-full text-xs font-semibold text-red-500 mt-2 py-1">
                          {t("cancelVisitLink")}
                        </button>
                      </div>
                    </>
                  )}

                  {!["PENDING_APPROVAL", "SCHEDULED"].includes(v.status) && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={cn("badge", v.status === "COMPLETED" ? "badge-success" : "badge-gray")}>{isOneOf(STATUSES, v.status) ? t(`status.${v.status}`) : v.status}</span>
                      <div className="flex items-center gap-3">
                        {v.review && <span className="text-xs text-amber-600 font-semibold flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{v.review.rating}/5</span>}
                        {/* Readable after the visit; open for follow-up questions for a few days. */}
                        {v.status === "COMPLETED" && (
                          <Link href={`/nurse/chat/${v.id}`} className="relative text-xs font-semibold text-rose-600 flex items-center gap-1 hover:underline">
                            <MessageCircle className="w-3.5 h-3.5" /> {t("chat")}
                            {v.unreadMessageCount > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{v.unreadMessageCount}</span>}
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                  {v.status === "COMPLETED" && v.doctorNotes && <p className="text-xs text-slate-500 mt-2">{t("notes", { notes: v.doctorNotes })}</p>}
                  {v.status === "PENDING_APPROVAL" && (
                    <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" />{t("requested", { date: new Date(v.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) })}</p>
                  )}
                </div>
              );
            })}
            {tab === "history" && past.hasMore && (
              <button onClick={() => void past.loadMore()} disabled={past.loadingMore} className="btn-secondary w-full py-2.5 text-sm">
                {past.loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : t("loadMore", { count: historyTotal - history.length })}
              </button>
            )}
          </div>
        )}
      </div>

      {completeTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-800 mb-1">{t("completeDialog.title")}</h3>
            <p className="text-sm text-slate-500 mb-3">{t("completeDialog.serviceFor", { service: completeTarget.serviceName ?? "", name: patientLabel(completeTarget) })}</p>
            <label className="input-label">{t("completeDialog.notes")}</label>
            <textarea rows={3} className="input-field" placeholder={t("completeDialog.notesPlaceholder")} value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setCompleteTarget(null)} className="btn-secondary flex-1">{tc("back")}</button>
              <button
                disabled={busyId === completeTarget.id}
                onClick={async () => { if (await setStatus(completeTarget.id, "COMPLETED", visitNotes.trim() || undefined)) setCompleteTarget(null); }}
                className="btn-primary flex-1 justify-center"
              >
                {busyId === completeTarget.id ? <Loader2 className="w-4 h-4 animate-spin" /> : t("completeDialog.markComplete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {journeyConfirm && (
        <ConfirmDialog
          icon={Car}
          tone={journeyConfirm.action === "start" ? "primary" : "warning"}
          title={journeyConfirm.action === "start" ? t("journeyDialog.startTitle", { name: patientLabel(journeyConfirm.visit) }) : t("journeyDialog.stopTitle")}
          message={journeyConfirm.action === "start" ? t("journeyDialog.startBody") : t("journeyDialog.stopBody")}
          confirmLabel={journeyConfirm.action === "start" ? t("startJourney") : t("stopJourney")}
          busyLabel={journeyConfirm.action === "start" ? t("journeyDialog.starting") : t("journeyDialog.stopping")}
          busy={busyId === journeyConfirm.visit.id}
          onCancel={() => setJourneyConfirm(null)}
          onConfirm={async () => {
            const { visit, action } = journeyConfirm;
            // Stays open on failure so it can be retried (the unpaid warning
            // takes over from it).
            const ok = action === "start" ? await startJourney(visit.id) : await stopJourney(visit.id);
            if (ok) setJourneyConfirm(null);
          }}
        />
      )}

      {unpaidStart && (
        <UnpaidJourneyWarning
          info={unpaidStart}
          busy={busyId === unpaidStart.id}
          onClose={() => setUnpaidStart(null)}
          onGoAnyway={() => { void startJourney(unpaidStart.id, true); }}
        />
      )}

      {cancelTarget && (
        <ConfirmDialog
          icon={AlertTriangle}
          tone="danger"
          title={t("cancelDialog.title")}
          message={cancelTarget.paymentStatus === "PAID" ? t("cancelDialog.bodyPaid") : t("cancelDialog.bodyUnpaid")}
          confirmLabel={t("cancelDialog.confirm")}
          busyLabel={t("cancelDialog.cancelling")}
          busy={busyId === cancelTarget.id}
          onCancel={() => setCancelTarget(null)}
          onConfirm={async () => { if (await setStatus(cancelTarget.id, "CANCELLED")) setCancelTarget(null); }}
        />
      )}
    </div>
  );
}
