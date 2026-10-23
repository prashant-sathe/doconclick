"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  CalendarCheck, Clock, Video, Home, Building2, Stethoscope, Star,
  Loader2, CheckCircle2, XCircle, Paperclip, IndianRupee,
  Navigation, Plus, Trash2, History, ThumbsUp, ThumbsDown, Inbox,
  Car, MapPinCheck, AlertTriangle, MessageCircle, Search, X, FileText,
  MoreHorizontal, UserX, CalendarClock, ChevronDown, HeartPulse, UserPlus, QrCode, Phone,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  isOverdue, byVisitAsc, byVisitDesc, nextUpcoming, matchesQueueFilters, matchesPatientSearch, contactLinks, hasActiveFilters,
  DEFAULT_QUEUE_FILTERS, QUEUE_RANGES, QUEUE_TYPES, QUEUE_STATUSES, type QueueFilters,
} from "@/lib/doctorQueue";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import PaymentQrPanel from "@/components/doctor/PaymentQrPanel";
import PrescriptionViewer from "@/components/doctor/PrescriptionViewer";
import UnpaidJourneyWarning, { type UnpaidStart } from "@/components/UnpaidJourneyWarning";
import { OfflineToggle } from "@/components/ProviderAway";
import EnableNotificationsPrompt from "@/components/EnableNotificationsPrompt";
import AnnouncementPopup from "@/components/AnnouncementPopup";
import { hasActiveDoctorSubscription } from "@/lib/subscription";
import { playMessageChime } from "@/lib/playNotificationSound";
import { FREQUENCY_OPTIONS, DURATION_OPTIONS, TEST_SUGGESTIONS } from "@/lib/medicalOptions";
import { VIDEO_UNLOCK_DELAY_SECONDS } from "@/lib/videoCall";
import { cn, formatDoctorName } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import { errorMessage, mutate, useLoad } from "@/lib/apiClient";
import RescheduleRequestBox from "@/components/RescheduleRequestBox";
import { getCurrentPositionCompat } from "@/lib/platform";
import { istDayKey, istMinutesOfDay } from "@/lib/istDate";
import { useJourneyTracker } from "@/components/JourneyTracker";
import { useAppointmentFeed, useAppointmentHistory, mergeAppointments } from "@/components/AppointmentFeed";
import PullToRefresh from "@/components/PullToRefresh";
import { compressImage } from "@/lib/compressImage";
import { PACKAGE_VISIT_OPTIONS, PACKAGE_INTERVAL_OPTIONS } from "@/lib/nursePackage";
import { vitalsSummary, type VitalsInput } from "@/lib/vitals";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

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
  referralGiven?: { id: string; service: { name: string } } | null;
  // Latest vitals a nurse recorded for this patient in the last 30 days.
  latestVitals?: (VitalsInput & { recordedAt: string; alertLevel: string; alerts: string | null }) | null;
  recentVitalsCount?: number;
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
  travelStatus: string;
  scheduledAt: string;
  requestedScheduledAt: string | null;
  acceptedAt: string | null;
  unreadMessageCount: number;
  // Set when the doctor or front desk booked it (/doctor/walk-in).
  bookedById: string | null;
  clinicId: string | null;
  clinic: { name: string } | null;
  patient: {
    name: string;
    mobile: string;
  };
  // HOME only: the address snapshotted at booking (profile for older rows).
  visit: VisitLocation | null;
}

interface VisitLocation {
  address: string | null;
  landmark: string | null;
  pinCode: string | null;
  lat: number | null;
  lng: number | null;
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

interface TestRow {
  name: string;
  instructions: string;
}

const TYPE_ICON: Record<string, React.ElementType> = { HOME: Home, CLINIC: Building2, VIDEO: Video };

// FREQUENCY_OPTIONS / DURATION_OPTIONS values are what's saved on the
// prescription (and printed on it) — only the dropdown labels are translated.
const FREQUENCY_KEY: Record<string, "onceDaily" | "twiceDaily" | "thriceDaily" | "fourTimesDaily" | "beforeMeals" | "afterMeals" | "atBedtime" | "asNeeded" | "other"> = {
  "Once daily": "onceDaily", "Twice daily": "twiceDaily", "Thrice daily": "thriceDaily", "Four times daily": "fourTimesDaily",
  "Before meals": "beforeMeals", "After meals": "afterMeals", "At bedtime": "atBedtime", "As needed": "asNeeded", Other: "other",
};
const DURATION_KEY: Record<string, "days3" | "days5" | "days7" | "days10" | "weeks2" | "month1" | "other"> = {
  "3 days": "days3", "5 days": "days5", "7 days": "days7", "10 days": "days10", "2 weeks": "weeks2", "1 month": "month1", Other: "other",
};

function patientLabel(a: Appointment): string {
  return a.relation !== "Self" && a.patientName ? a.patientName : a.patient.name;
}

// Grace period after accepting a request within which a doctor can cancel
// without the late-cancellation warning below.
const CANCEL_GRACE_PERIOD_MS = 10 * 60 * 1000;

function isLateCancellation(a: Appointment): boolean {
  if (!a.acceptedAt) return false;
  return Date.now() - new Date(a.acceptedAt).getTime() > CANCEL_GRACE_PERIOD_MS;
}
// Mirrors the server-side guard in the PATCH route: only once the scheduled
// time has passed, and only after actually arriving for a home visit.
function canMarkNoShow(a: Appointment, now: number): boolean {
  if (new Date(a.scheduledAt).getTime() > now) return false;
  if (a.consultType === "HOME" && a.travelStatus !== "ARRIVED") return false;
  return true;
}
// Seconds left before a paid video appointment's "Join Video Consultation" button
// unlocks; 0 once VIDEO_UNLOCK_DELAY_SECONDS has passed since payment.
function videoUnlockRemainingSec(a: Appointment, now: number): number {
  if (!a.paidAt) return 0;
  const unlockAt = new Date(a.paidAt).getTime() + VIDEO_UNLOCK_DELAY_SECONDS * 1000;
  return Math.max(0, Math.ceil((unlockAt - now) / 1000));
}
function historyHref(a: Appointment): string {
  return a.dependentId ? `/doctor/patients/${a.patientId}?dependentId=${a.dependentId}` : `/doctor/patients/${a.patientId}`;
}

// What nurses recorded since the doctor last saw this patient — one tap to
// the full trend on the patient's history page.
function VitalsChip({ a }: { a: Appointment }) {
  const t = useTranslations("doctor.dashboard");
  const locale = formattingLocale(useLocale());
  const v = a.latestVitals;
  if (!v) return null;
  const critical = v.alertLevel === "CRITICAL";
  const warn = v.alertLevel === "WARNING";
  const when = new Date(v.recordedAt).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return (
    <Link
      href={historyHref(a)}
      className={cn(
        "mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold border",
        critical ? "bg-red-50 border-red-200 text-red-700" : warn ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-600"
      )}
    >
      {critical || warn ? <AlertTriangle className="w-3 h-3" /> : <HeartPulse className="w-3 h-3 text-rose-500" />}
      {t("vitals", { when, summary: vitalsSummary(v) })}
      {(a.recentVitalsCount ?? 0) > 1 && <span className="font-normal opacity-80">{t("readings", { count: a.recentVitalsCount ?? 0 })}</span>}
    </Link>
  );
}

// ── Today's Timeline ─────────────────────────────────────────────────────
// No appointment has a stored duration (bookable slots are just points in
// time, 10 min apart) — this is purely a visual block size for the calendar
// layout below, not a real scheduling constraint.
const TIMELINE_BLOCK_MINUTES = 30;
const TIMELINE_HOUR_HEIGHT = 64;
const TIMELINE_LABEL_WIDTH = 44;

interface TimelineItem {
  id: string;
  appt: Appointment;
  startMin: number;
  endMin: number;
}

interface TimelinePlacement extends TimelineItem {
  col: number;
  cols: number;
}

// Standard calendar-style overlap layout: group appointments into clusters of
// mutually-overlapping time ranges, then greedily assign each a column within
// its own cluster (reusing a column once its previous occupant has ended) so
// concurrent appointments split the width evenly instead of stacking on top
// of each other.
function layoutTimeline(items: TimelineItem[]): TimelinePlacement[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin);
  const clusters: TimelineItem[][] = [];
  let current: TimelineItem[] = [];
  let clusterEnd = -Infinity;
  for (const item of sorted) {
    if (current.length === 0 || item.startMin < clusterEnd) {
      current.push(item);
      clusterEnd = Math.max(clusterEnd, item.endMin);
    } else {
      clusters.push(current);
      current = [item];
      clusterEnd = item.endMin;
    }
  }
  if (current.length) clusters.push(current);

  const placed: TimelinePlacement[] = [];
  for (const cluster of clusters) {
    const columnEnds: number[] = [];
    const colOf = new Map<string, number>();
    for (const item of cluster) {
      let col = columnEnds.findIndex((end) => end <= item.startMin);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(item.endMin);
      } else {
        columnEnds[col] = item.endMin;
      }
      colOf.set(item.id, col);
    }
    const cols = columnEnds.length;
    for (const item of cluster) {
      placed.push({ ...item, col: colOf.get(item.id) ?? 0, cols });
    }
  }
  return placed;
}

function timelineDotColor(status: string): string {
  if (status === "PENDING_APPROVAL") return "bg-amber-400";
  return "bg-teal-500";
}
const EMPTY_ROW: MedicineRow = { name: "", dosage: "", frequency: "", frequencyOther: "", duration: "", durationOther: "", instructions: "" };
const EMPTY_TEST_ROW: TestRow = { name: "", instructions: "" };

// Prescriptions are drafted incrementally, so we snapshot the in-progress
// medicines/notes/confirmation to localStorage keyed by appointment id — this
// lets a doctor navigate away (or collapse the form) and come back without
// losing what they'd already typed.
function draftKeyFor(appointmentId: string) {
  return `prescriptionDraft:${appointmentId}`;
}
type NurseCareDraft = { on: boolean; serviceId: string; visits: number; intervalDays: number; instructions: string };
const EMPTY_NURSE_CARE: NurseCareDraft = { on: false, serviceId: "", visits: 1, intervalDays: 1, instructions: "" };

function loadDraft(appointmentId: string): { medicines?: MedicineRow[]; tests?: TestRow[]; notes?: string; confirmed?: boolean; nurseCare?: NurseCareDraft } {
  try {
    const raw = localStorage.getItem(draftKeyFor(appointmentId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function CompleteVisitForm({ appt, onDone, onCancel }: {
  appt: Appointment;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("doctor.completeVisit");
  const tc = useTranslations("doctor.common");
  const draftKey = draftKeyFor(appt.id);
  const [notes, setNotes] = useState(() => {
    const draft = loadDraft(appt.id).notes;
    return typeof draft === "string" ? draft : "";
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [medicines, setMedicines] = useState<MedicineRow[]>(() => {
    const draft = loadDraft(appt.id).medicines;
    return Array.isArray(draft) && draft.length > 0 ? draft : [{ ...EMPTY_ROW }];
  });
  const [tests, setTests] = useState<TestRow[]>(() => {
    const draft = loadDraft(appt.id).tests;
    return Array.isArray(draft) && draft.length > 0 ? draft : [{ ...EMPTY_TEST_ROW }];
  });
  const [confirmed, setConfirmed] = useState(() => loadDraft(appt.id).confirmed === true);
  // Doctor -> nurse referral: "this patient needs nurse care at home".
  const [nurseCare, setNurseCare] = useState<NurseCareDraft>(() => ({ ...EMPTY_NURSE_CARE, ...(loadDraft(appt.id).nurseCare ?? {}) }));
  const servicesLoad = useLoad<{ id: string; name: string; requiresPrescription: boolean }[]>("/api/nurse-services", { fallback: t("servicesLoadFailed") });
  const nurseServices = servicesLoad.data ?? [];
  const [referralError, setReferralError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const hasMedicines = medicines.some((m) => m.name.trim());
  const hasTests = tests.some((row) => row.name.trim());
  const hasPrescriptionItems = hasMedicines || hasTests;

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ medicines, tests, notes, confirmed, nurseCare }));
    } catch {
      // ignore unavailable storage
    }
  }, [draftKey, medicines, tests, notes, confirmed, nurseCare]);
  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore unavailable storage
    }
  };

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

  const setTest = (i: number, k: keyof TestRow, v: string) => {
    setTests((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  };
  const addTestRow = () => setTests((rows) => [...rows, { ...EMPTY_TEST_ROW }]);
  const removeTestRow = (i: number) => setTests((rows) => rows.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!hasPrescriptionItems || !confirmed) return;
    if (nurseCare.on && !nurseCare.serviceId) { setReferralError(t("pickNurseService")); setConfirmingComplete(false); return; }
    setConfirmingComplete(false);
    setBusy(true);
    setFileError("");
    setReferralError("");
    setSubmitError("");
    try {
      const validMedicines = medicines
        .filter((m) => m.name.trim())
        .map((m) => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency === "Other" ? m.frequencyOther.trim() : m.frequency,
          duration: m.duration === "Other" ? m.durationOther.trim() : m.duration,
          instructions: m.instructions,
        }));
      const validTests = tests
        .filter((row) => row.name.trim())
        .map((row) => ({ name: row.name, instructions: row.instructions }));
      // One call saves notes, prescription, files and referral and closes the
      // visit — all or nothing (POST /api/appointments/[id]/complete), so a
      // refusal (unpaid, not arrived) leaves nothing half-saved to retry over.
      const form = new FormData();
      form.append("data", JSON.stringify({
        doctorNotes: notes,
        medicines: validMedicines,
        tests: validTests,
        nurseReferral: nurseCare.on
          ? { serviceId: nurseCare.serviceId, visits: nurseCare.visits, intervalDays: nurseCare.intervalDays, instructions: nurseCare.instructions }
          : null,
      }));
      // Re-read each picked File into memory before appending: on Android the
      // WebView can't stream a content:// -backed File into a fetch() multipart
      // body, which fails the whole request with "Failed to fetch".
      for (const f of files) {
        const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
          reader.readAsArrayBuffer(f);
        });
        const prepared = await compressImage(new File([bytes], f.name, { type: f.type || "application/octet-stream" }));
        form.append("file", prepared, prepared.name);
      }
      const res = await fetch(`/api/appointments/${appt.id}/complete`, { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        const message = body.error ?? t("completeFailed");
        if (body.code === "INVALID_FILE") setFileError(message);
        else if (body.code === "INVALID_REFERRAL") setReferralError(message);
        else setSubmitError(message);
        return;
      }
      clearDraft();
      onDone();
    } catch {
      setSubmitError(t("networkError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 bg-teal-50 border border-teal-100 rounded-xl p-4 space-y-3">
      <textarea
        rows={2}
        className="input-field resize-none"
        placeholder={t("notesPlaceholder")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t("prescription")}</p>
        <div className="space-y-2">
          {medicines.map((m, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-2.5 grid grid-cols-2 sm:grid-cols-5 gap-1.5 items-center">
              <input className="input-field text-xs py-1.5 col-span-2 sm:col-span-1" placeholder={t("medicineName")} value={m.name} onChange={(e) => setMed(i, "name", e.target.value)} />
              <input className="input-field text-xs py-1.5" placeholder={t("dosage")} value={m.dosage} onChange={(e) => setMed(i, "dosage", e.target.value)} />
              <div className="space-y-1">
                <select className="input-field text-xs py-1.5" value={m.frequency} onChange={(e) => setMed(i, "frequency", e.target.value)}>
                  <option value="">{t("frequency")}</option>
                  {FREQUENCY_OPTIONS.map((o) => <option key={o} value={o}>{FREQUENCY_KEY[o] ? t(`frequencyOption.${FREQUENCY_KEY[o]}`) : o}</option>)}
                </select>
                {m.frequency === "Other" && (
                  <input className="input-field text-xs py-1.5" placeholder={t("specifyFrequency")} value={m.frequencyOther} onChange={(e) => setMed(i, "frequencyOther", e.target.value)} />
                )}
              </div>
              <div className="space-y-1">
                <select className="input-field text-xs py-1.5" value={m.duration} onChange={(e) => setMed(i, "duration", e.target.value)}>
                  <option value="">{t("duration")}</option>
                  {DURATION_OPTIONS.map((o) => <option key={o} value={o}>{DURATION_KEY[o] ? t(`durationOption.${DURATION_KEY[o]}`) : o}</option>)}
                </select>
                {m.duration === "Other" && (
                  <input className="input-field text-xs py-1.5" placeholder={t("specifyDuration")} value={m.durationOther} onChange={(e) => setMed(i, "durationOther", e.target.value)} />
                )}
              </div>
              <div className="flex gap-1.5">
                <input className="input-field text-xs py-1.5 flex-1" placeholder={t("instructions")} value={m.instructions} onChange={(e) => setMed(i, "instructions", e.target.value)} />
                {medicines.length > 1 && (
                  <button type="button" onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 flex-shrink-0" aria-label={t("removeRow")}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addRow} className="mt-2 text-xs text-teal-600 font-semibold flex items-center gap-1 hover:underline">
          <Plus className="w-3.5 h-3.5" /> {t("addMedicine")}
        </button>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t("recommendedTests")}</p>
        <datalist id="test-suggestions">
          {TEST_SUGGESTIONS.map((o) => <option key={o} value={o} />)}
        </datalist>
        <div className="space-y-2">
          {tests.map((row, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-1.5 items-center">
              <input
                className="input-field text-xs py-1.5 sm:col-span-1"
                placeholder={t("testName")}
                list="test-suggestions"
                value={row.name}
                onChange={(e) => setTest(i, "name", e.target.value)}
              />
              <div className="flex gap-1.5 sm:col-span-2">
                <input className="input-field text-xs py-1.5 flex-1" placeholder={t("testInstructions")} value={row.instructions} onChange={(e) => setTest(i, "instructions", e.target.value)} />
                {tests.length > 1 && (
                  <button type="button" onClick={() => removeTestRow(i)} className="text-red-400 hover:text-red-600 flex-shrink-0" aria-label={t("removeRow")}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addTestRow} className="mt-2 text-xs text-teal-600 font-semibold flex items-center gap-1 hover:underline">
          <Plus className="w-3.5 h-3.5" /> {t("addTest")}
        </button>
      </div>

      <div className="rounded-xl border border-rose-100 bg-white p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-rose-500" checked={nurseCare.on} onChange={(e) => { setNurseCare((c) => ({ ...c, on: e.target.checked })); setReferralError(""); }} />
          <HeartPulse className="w-4 h-4 text-rose-500" /> {t("needsNurse")}
        </label>
        <p className="text-[11px] text-slate-500 mt-1 ml-6">{t("needsNurseHint")}</p>
        {nurseCare.on && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            <select className="input-field text-xs py-1.5 sm:col-span-3" value={nurseCare.serviceId} onChange={(e) => { setNurseCare((c) => ({ ...c, serviceId: e.target.value })); setReferralError(""); }}>
              <option value="">{t("nurseService")}</option>
              {nurseServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {servicesLoad.error && (
              <p className="text-xs text-red-500 sm:col-span-3">
                {servicesLoad.error}{" "}
                <button type="button" onClick={servicesLoad.reload} disabled={servicesLoad.reloading} className="font-semibold underline disabled:opacity-60">{tc("retry")}</button>
              </p>
            )}
            <select className="input-field text-xs py-1.5" value={nurseCare.visits} onChange={(e) => setNurseCare((c) => ({ ...c, visits: Number(e.target.value) }))}>
              {PACKAGE_VISIT_OPTIONS.map((n) => <option key={n} value={n}>{t("visits", { n })}</option>)}
            </select>
            <select className="input-field text-xs py-1.5" value={nurseCare.intervalDays} disabled={nurseCare.visits === 1} onChange={(e) => setNurseCare((c) => ({ ...c, intervalDays: Number(e.target.value) }))}>
              {PACKAGE_INTERVAL_OPTIONS.map((n) => <option key={n} value={n}>{t("interval", { n })}</option>)}
            </select>
            <input className="input-field text-xs py-1.5" placeholder={t("nurseInstructions")} value={nurseCare.instructions} onChange={(e) => setNurseCare((c) => ({ ...c, instructions: e.target.value }))} />
          </div>
        )}
        {referralError && <p className="text-xs text-red-500 mt-2">{referralError}</p>}
      </div>

      {hasPrescriptionItems && (
        <label className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-white px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-teal-600 flex-shrink-0"
          />
          <span className="text-xs text-slate-700">
            {t("confirmText")}
          </span>
        </label>
      )}

      <div>
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <Paperclip className="w-3.5 h-3.5" />
          {t("attach")}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden"
            onChange={(e) => addFiles(e.target.files)} />
        </label>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">
                <span className="truncate">{f.name}</span>
                <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 flex-shrink-0" aria-label={t("removeFile")}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileError && <p className="text-xs text-red-500 mt-1">{fileError}</p>}
      </div>
      {submitError && <p className="text-xs text-red-500">{submitError}</p>}
      <div className="flex gap-2">
        <button onClick={() => setConfirmingCancel(true)} className="btn-secondary py-1.5 px-3 text-xs flex-1 justify-center">{t("cancel")}</button>
        <button
          onClick={() => setConfirmingComplete(true)}
          disabled={busy || !hasPrescriptionItems || !confirmed}
          title={!hasPrescriptionItems ? t("needItems") : !confirmed ? t("needConfirm") : undefined}
          className="btn-primary py-1.5 px-3 text-xs flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("markComplete")}
        </button>
      </div>

      {confirmingCancel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-800">{t("discardTitle")}</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              {t("discardBody")}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmingCancel(false)} className="btn-secondary flex-1">
                {t("keepEditing")}
              </button>
              <button
                onClick={() => { clearDraft(); onCancel(); }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                {t("discard")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingComplete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-teal-600" />
              <h3 className="font-bold text-slate-800">{t("completeTitle")}</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              {t("completeBody", { name: patientLabel(appt) })}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmingComplete(false)} className="btn-secondary flex-1">
                {t("goBack")}
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("markComplete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function navigateUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// Directions to the booked visit address — its coordinates when known, else a
// search for the address text.
function visitNavUrl(v: VisitLocation | null) {
  if (v?.lat != null && v.lng != null) return navigateUrl(v.lat, v.lng);
  if (v?.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}`;
  return null;
}

function visitAddressText(v: VisitLocation) {
  return [v.address, v.landmark].filter(Boolean).join(", ") + (v.pinCode ? ` — ${v.pinCode}` : "");
}

// The home-visit address line on a request/visit card, tappable for directions.
// Call / WhatsApp the account holder — hidden unless it's a real mobile number.
function ContactLinks({ mobile }: { mobile: string }) {
  const t = useTranslations("doctor.dashboard");
  const links = contactLinks(mobile);
  if (!links) return null;
  const pill = "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors";
  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      <span className="text-xs text-slate-400 tabular-nums">{mobile}</span>
      <a href={links.tel} className={cn(pill, "border-slate-200 text-slate-600 hover:bg-slate-50")} title={t("callTitle", { mobile })}>
        <Phone className="w-3 h-3" /> {t("call")}
      </a>
      <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className={cn(pill, "border-emerald-200 text-emerald-700 hover:bg-emerald-50")} title={t("whatsappTitle", { mobile })}>
        <MessageCircle className="w-3 h-3" /> {t("whatsapp")}
      </a>
    </div>
  );
}

function VisitAddressLine({ visit }: { visit: VisitLocation | null }) {
  const t = useTranslations("doctor.dashboard");
  const url = visitNavUrl(visit);
  if (!visit || !url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-1 text-xs text-blue-600 font-semibold mt-1 hover:underline"
    >
      <Navigation className="w-3 h-3 mt-0.5 flex-shrink-0" />
      <span>{visit.address ? visitAddressText(visit) : t("viewPatientLocation")}</span>
    </a>
  );
}

export default function DoctorDashboard() {
  const router = useRouter();
  const t = useTranslations("doctor.dashboard");
  const tc = useTranslations("doctor.common");
  const locale = formattingLocale(useLocale());
  const { user, loading: authLoading } = useAuth();
  const isStaff = user?.role === "STAFF";
  const [doctor, setDoctor] = useState<DoctorMe | null>(null);
  const [staffActive, setStaffActive] = useState<boolean | null>(null);
  const [staffDoctorName, setStaffDoctorName] = useState<string | null>(null);
  // Live + recent appointments come from the layout's shared 5s poll (the
  // header's request bell reads the same one — src/components/AppointmentFeed.tsx);
  // older history is paged in on demand.
  const feed = useAppointmentFeed<Appointment>();
  const past = useAppointmentHistory<Appointment>(user?.role === "DOCTOR" || user?.role === "STAFF");
  const appointments = useMemo(() => mergeAppointments(feed.items, past.items), [feed.items, past.items]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_QUEUE_FILTERS);
  // True until the first successful load; a failed (re)load sets apptsError
  // and keeps whatever was last loaded.
  const loadingAppts = feed.items === null;
  const apptsError = feed.error ?? past.error;
  const [apptsRetrying, setApptsRetrying] = useState(false);
  // /api/doctors/me (or staff/me for STAFF) failing — the page is gated on it.
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootRetrying, setBootRetrying] = useState(false);
  const toast = useToast();
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<{ id: string; message: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [noShowTarget, setNoShowTarget] = useState<Appointment | null>(null);
  // Unpaid online visit whose pay-by-phone QR is open.
  const [payQrFor, setPayQrFor] = useState<Appointment | null>(null);
  // Prescription preview / download / WhatsApp for a completed consultation.
  const [rxFor, setRxFor] = useState<{ id: string; patientId: string; justCompleted?: boolean } | null>(null);
  const [markingNoShow, setMarkingNoShow] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Appointment | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [acceptTarget, setAcceptTarget] = useState<Appointment | null>(null);
  const [confirmingBulkAccept, setConfirmingBulkAccept] = useState(false);
  const [bulkAccepting, setBulkAccepting] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [cancelledExpanded, setCancelledExpanded] = useState(false);
  const [noShowExpanded, setNoShowExpanded] = useState(false);
  const [announcementsDone, setAnnouncementsDone] = useState(false);
  // The "⋯" menu is portalled to <body> (see render below) so it can't be
  // clipped by the appointment card's overflow-hidden — it needs its own
  // fixed-position coordinates rather than relying on CSS anchoring to a
  // clipped ancestor.
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openMenu]);
  const PAGE_SIZE = 5;

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/dashboard");
    if (!authLoading && user && user.role !== "DOCTOR" && user.role !== "STAFF") router.push("/login");
  }, [authLoading, user, router]);

  const loadDoctor = useCallback(async () => {
    try {
      const res = await fetch("/api/doctors/me");
      if (!res.ok) { setBootError(await errorMessage(res, t("profileLoadFailed"))); return; }
      const d: DoctorMe = await res.json();
      setDoctor(d);
      setBootError(null);
      if (!d.doctorProfile?.registrationFeePaid) {
        router.push("/doctor/profile");
      } else if (!hasActiveDoctorSubscription(d.doctorProfile)) {
        router.push("/doctor/subscribe");
      }
    } catch {
      setBootError(tc("networkError"));
    }
  }, [router, t, tc]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    // Fetching on mount: it only sets state after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDoctor();
  }, [user, loadDoctor]);

  // Staff has no doctorProfile of their own — check their assignment is
  // still active instead of the registration/subscription gates above. A
  // revoked account is signed out directly (skipping the confirm-dialog
  // `logout()` used for the header's user-initiated Sign Out button).
  const loadStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/doctor/staff/me");
      // 403/404 = no assignment any more (signed out below, like a revoked
      // one). Anything else is a failed load, not a revocation — retryable.
      if (!res.ok && res.status !== 403 && res.status !== 404) {
        setBootError(await errorMessage(res, t("accountLoadFailed")));
        return;
      }
      const d: { active: boolean; doctorName: string } | null = res.ok ? await res.json() : null;
      if (!d || !d.active) {
        setStaffActive(false);
        // Signing out regardless — a failed logout call doesn't change that.
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        router.push("/login");
        return;
      }
      setBootError(null);
      setStaffActive(true);
      setStaffDoctorName(d.doctorName);
    } catch {
      setBootError(tc("networkError"));
    }
  }, [router, t, tc]);

  useEffect(() => {
    if (!user || user.role !== "STAFF") return;
    // Fetching on mount: it only sets state after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStaff();
  }, [user, loadStaff]);

  const retryBoot = async () => {
    setBootRetrying(true);
    await (isStaff ? loadStaff() : loadDoctor());
    setBootRetrying(false);
  };

  const unreadTotalRef = useRef<number | null>(null);
  const [removingReferral, setRemovingReferral] = useState<string | null>(null);
  const removeReferral = async (appointmentId: string) => {
    setRemovingReferral(appointmentId);
    const res = await mutate(`/api/appointments/${appointmentId}/nurse-referral`, { method: "DELETE", fallback: t("removeReferralFailed") });
    if (res.ok) {
      void loadAppointments();
    } else {
      toast.error(res.error);
    }
    setRemovingReferral(null);
  };

  // After a change (and on Retry): fetch now rather than wait for the next
  // poll. A failed load keeps the last list on screen (with a Retry banner);
  // the next successful poll clears the error.
  const { refresh: refreshFeed } = feed;
  const { refresh: refreshPast } = past;
  const loadAppointments = useCallback(async () => {
    await Promise.all([refreshFeed(), refreshPast()]);
  }, [refreshFeed, refreshPast]);

  // Chime when a new chat message arrives (the live/recent feed covers the
  // chat follow-up window, so it has every chat that can still get one).
  useEffect(() => {
    if (!feed.items) return;
    const total = feed.items.reduce((sum, a) => sum + a.unreadMessageCount, 0);
    if (unreadTotalRef.current !== null && total > unreadTotalRef.current) playMessageChime();
    unreadTotalRef.current = total;
  }, [feed.items]);
  const retryAppointments = async () => {
    setApptsRetrying(true);
    await loadAppointments();
    setApptsRetrying(false);
  };

  // Ticks the video-call payment-unlock countdown independently of the 5s data poll.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const respond = async (id: string, status: "SCHEDULED" | "REJECTED") => {
    setRespondingId(id);
    setRespondError(null);
    const res = await mutate(`/api/appointments/${id}`, { method: "PATCH", body: { status }, fallback: t("updateRequestFailed") });
    setRespondingId(null);
    // Shown inline on the request's card.
    if (!res.ok) setRespondError({ id, message: res.error });
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
    const res = await mutate(`/api/appointments/${cancelTarget.id}`, { method: "PATCH", body: { status: "CANCELLED" }, fallback: t("cancelFailed") });
    setCancelling(false);
    // Failed: the dialog stays open for a retry.
    if (!res.ok) { toast.error(res.error); return; }
    setCancelTarget(null);
    loadAppointments();
  };

  const confirmBulkAccept = async () => {
    setBulkAccepting(true);
    setBulkNotice("");
    try {
      const res = await fetch("/api/appointments/bulk-accept", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBulkNotice(data.error ?? t("bulkAcceptFailed"));
      } else if (data.skipped?.length) {
        // Requests that overlap a slot already confirmed stay pending for a manual decision.
        setBulkNotice(t("bulkPartial", { count: data.count, skipped: data.skipped.length }));
      }
    } catch {
      setBulkNotice(t("networkErrorRetry"));
    } finally {
      setBulkAccepting(false);
      setConfirmingBulkAccept(false);
      loadAppointments();
    }
  };

  const confirmNoShow = async () => {
    if (!noShowTarget) return;
    setMarkingNoShow(true);
    const res = await mutate(`/api/appointments/${noShowTarget.id}`, { method: "PATCH", body: { status: "NO_SHOW" }, fallback: t("noShowFailed") });
    setMarkingNoShow(false);
    if (!res.ok) { toast.error(res.error); return; }
    setNoShowTarget(null);
    loadAppointments();
  };

  // ── Live journey tracking for home visits ───────────────────────────────
  // The watcher itself lives in JourneyTracker (the doctor layout), so it
  // survives leaving this page (chat, video…) and resumes after a reload.
  const journey = useJourneyTracker();
  const [startingJourneyId, setStartingJourneyId] = useState<string | null>(null);
  // "Start journey" / "Stop journey" both notify the patient — confirm first.
  const [journeyConfirm, setJourneyConfirm] = useState<{ appt: Appointment; action: "start" | "stop" } | null>(null);
  const [journeyError, setJourneyError] = useState<{ id: string; message: string } | null>(null);
  // Setting off for an unpaid home visit — the server refused and reminded the patient.
  const [unpaidStart, setUnpaidStart] = useState<UnpaidStart | null>(null);

  const sendPosition = (apptId: string, travelStatus: "NOT_STARTED" | "ON_THE_WAY" | "ARRIVED", fallback: string, lat?: number, lng?: number) => {
    return mutate(`/api/appointments/${apptId}/travel`, {
      method: "PATCH",
      body: { travelStatus, ...(lat != null && lng != null ? { lat, lng } : {}) },
      fallback,
    });
  };

  const startJourney = async (apptId: string, acknowledgeUnpaid = false) => {
    setStartingJourneyId(apptId);
    setJourneyError(null);
    try {
      const pos = await getCurrentPositionCompat({ enableHighAccuracy: true });
      const res = await fetch(`/api/appointments/${apptId}/travel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelStatus: "ON_THE_WAY", lat: pos.coords.latitude, lng: pos.coords.longitude, acknowledgeUnpaid }),
      }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      // Unpaid: the patient has been reminded; the doctor decides whether to go.
      if (res?.status === 409 && body.code === "UNPAID_VISIT") {
        const a = appointments.find((x) => x.id === apptId);
        setUnpaidStart({ id: apptId, patientName: a ? patientLabel(a) : t("thePatient"), amount: body.amount, reminderSent: body.reminderSent, reminderSentAt: body.reminderSentAt });
        return;
      }
      // The server refuses outside the start window (src/lib/journeyWindow.ts)
      // — don't start sharing location then.
      if (!res?.ok) {
        setJourneyError({ id: apptId, message: body.error ?? (res ? t("startJourneyFailed") : tc("networkError")) });
        return;
      }
      setUnpaidStart(null);
      await journey.track(apptId, { justSent: true });
    } catch {
      setJourneyError({ id: apptId, message: t("locationNeeded") });
    } finally {
      setStartingJourneyId(null);
      loadAppointments();
    }
  };

  // Back to "not started" — e.g. tapped by mistake, or turned back.
  const stopJourney = async (apptId: string) => {
    setJourneyError(null);
    await journey.stop();
    const res = await sendPosition(apptId, "NOT_STARTED", t("stopJourneyFailed"));
    if (!res.ok) setJourneyError({ id: apptId, message: res.error });
    loadAppointments();
  };

  const markArrived = async (apptId: string) => {
    setJourneyError(null);
    await journey.stop();
    const res = await sendPosition(apptId, "ARRIVED", t("arrivedFailed"));
    if (!res.ok) setJourneyError({ id: apptId, message: res.error });
    loadAppointments();
  };

  if (authLoading || !user || (user.role !== "DOCTOR" && user.role !== "STAFF")) {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (
    (isStaff && staffActive !== true) ||
    (!isStaff && (!doctor?.doctorProfile?.registrationFeePaid || !hasActiveDoctorSubscription(doctor.doctorProfile)))
  ) {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center p-4">
        {bootError ? (
          <div className="w-full max-w-sm"><LoadError error={bootError} onRetry={retryBoot} retrying={bootRetrying} /></div>
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        )}
      </div>
    );
  }

  const profile = doctor?.doctorProfile;
  // The search box (name or mobile) plus the date / type / clinic / status filters.
  const filtersOn = hasActiveFilters(filters);
  const matchesSearch = (a: Appointment) => matchesPatientSearch(a, search) && matchesQueueFilters(a, filters, now);
  const showSection = (status: string) => filters.status === "ALL" || filters.status === status;
  // Clinics this doctor has visits at — the filter only shows with two or more.
  const clinicOptions = [...new Map(appointments.filter((a) => a.clinicId && a.clinic).map((a) => [a.clinicId as string, a.clinic!.name])).entries()]
    .sort((x, y) => x[1].localeCompare(y[1]));
  const completedAll = appointments.filter((a) => a.status === "COMPLETED");
  // The queue (pending, upcoming) runs soonest-first; history newest-first.
  const pending = appointments.filter((a) => a.status === "PENDING_APPROVAL" && matchesSearch(a)).sort(byVisitAsc);
  const upcoming = appointments.filter((a) => a.status === "SCHEDULED" && matchesSearch(a)).sort(byVisitAsc);
  const cancelled = appointments.filter((a) => a.status === "CANCELLED" && matchesSearch(a)).sort(byVisitDesc);
  const noShow = appointments.filter((a) => a.status === "NO_SHOW" && matchesSearch(a)).sort(byVisitDesc);
  const completed = completedAll.filter((a) => a.paymentStatus === "PAID").filter(matchesSearch).sort(byVisitDesc);
  // Past visits nobody closed — regardless of the search box.
  const overdue = appointments.filter((a) => isOverdue(a, now)).sort(byVisitAsc);

  // "Today" and the timeline's clock are IST, whatever the device's zone is.
  const todayKey = istDayKey(new Date());
  const isToday = (iso: string) => istDayKey(iso) === todayKey;
  const todayUpcoming = upcoming.filter((a) => isToday(a.scheduledAt));
  const todayPending = pending.filter((a) => isToday(a.scheduledAt));
  const timelineItems: TimelineItem[] = [...todayUpcoming, ...todayPending].map((a) => {
    const startMin = istMinutesOfDay(a.scheduledAt);
    return { id: a.id, appt: a, startMin, endMin: startMin + TIMELINE_BLOCK_MINUTES };
  });
  const timelinePlacements = layoutTimeline(timelineItems);
  const nowMin = istMinutesOfDay(now);
  const timelineRangeStartHour = timelineItems.length
    ? Math.max(0, Math.min(nowMin, ...timelineItems.map((i) => i.startMin)) / 60 - 1)
    : 0;
  const timelineRangeEndHour = timelineItems.length
    ? Math.min(24, Math.max(nowMin, ...timelineItems.map((i) => i.endMin)) / 60 + 1)
    : 0;
  const timelineStartHour = Math.floor(timelineRangeStartHour);
  const timelineEndHour = Math.ceil(timelineRangeEndHour);
  const timelineHours = Array.from({ length: Math.max(0, timelineEndHour - timelineStartHour) }, (_, i) => timelineStartHour + i);
  const timelineTotalHeight = timelineHours.length * TIMELINE_HOUR_HEIGHT;
  const minutesToTimelineTop = (min: number) => ((min - timelineStartHour * 60) / 60) * TIMELINE_HOUR_HEIGHT;

  // Scrolls the matching card in Pending Requests / Upcoming Appointments
  // into view and briefly highlights it — expanding the paginated Upcoming
  // list first if the target is hidden behind "Load more".
  const jumpToCard = (id: string) => {
    const idx = upcoming.findIndex((a) => a.id === id);
    // Hidden by the search or a filter: clear them, and show the whole list
    // since its position in it isn't known yet.
    if (idx === -1 && !pending.some((a) => a.id === id)) {
      setSearch("");
      setFilters(DEFAULT_QUEUE_FILTERS);
      setUpcomingExpanded(true);
    }
    if (idx >= PAGE_SIZE && !upcomingExpanded) setUpcomingExpanded(true);
    window.setTimeout(() => {
      cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(id);
      window.setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1600);
    }, 80);
  };

  const todayEarnings = completedAll
    .filter((a) => a.paymentStatus === "PAID" && isToday(a.scheduledAt))
    .reduce((sum, a) => sum + (a.amount - a.platformFee), 0);
  // The soonest visit that isn't already over — never a stale one from days ago.
  const nextAppt = nextUpcoming(upcoming, now);
  const minutesTo = (iso: string) => Math.round((new Date(iso).getTime() - now) / 60000);
  // "in 41576 min" is meaningless for anything beyond a same-day appointment —
  // scale the unit up as the gap grows instead of always showing raw minutes.
  const formatTimeUntil = (mins: number): string => {
    if (mins < 60) return t("inMinutes", { n: mins });
    if (mins < 24 * 60) return t("inHours", { n: Math.round(mins / 60) });
    return t("inDays", { n: Math.round(mins / (24 * 60)) });
  };
  const hourLabel = (h: number) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", hour12: true, timeZone: "UTC" }).format(Date.UTC(2026, 0, 1, h));

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <PullToRefresh onRefresh={loadAppointments} className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Stethoscope className="w-7 h-7 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-slate-900 truncate">
              {isStaff ? user.name : formatDoctorName(doctor?.name ?? user.name)}
            </h1>
            {isStaff ? (
              <p className="text-slate-500 text-sm truncate">{t("frontDesk", { doctor: staffDoctorName ?? "—" })}</p>
            ) : (
              <p className="text-slate-500 text-sm truncate">
                {profile?.specialty ?? t("specialtyPending")} · {profile?.qualification ?? "—"} ·{" "}
                <span className="text-amber-500 font-semibold inline-flex items-center gap-0.5">
                  <Star className="w-3.5 h-3.5 fill-current" /> {(profile?.avgRating ?? 0).toFixed(1)}
                </span>
              </p>
            )}
          </div>
          <Link href="/doctor/walk-in" className="btn-primary ml-auto flex-shrink-0 py-2.5 px-3.5 text-sm" title={t("walkInTitle")}>
            <UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">{t("walkIn")}</span>
          </Link>
        </div>

        {!isStaff && <OfflineToggle timeOffHref="/doctor/profile/availability#time-off" onChanged={() => { void loadAppointments(); }} />}

        {apptsError && !loadingAppts && <LoadError error={apptsError} onRetry={retryAppointments} retrying={apptsRetrying} hasData />}

        <AnnouncementPopup onAllSeen={() => setAnnouncementsDone(true)} />
        {announcementsDone && <EnableNotificationsPrompt />}

        {/* Today at a glance — the day's shape in one card instead of a flat stat grid */}
        <div className="gradient-hero rounded-2xl p-5 mb-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
              {t("today", { date: new Date().toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) })}
            </span>
            <span className="text-[11px] font-bold bg-white/15 rounded-full px-2.5 py-1 flex-shrink-0">
              {t("todayCount", { count: todayUpcoming.length })}
            </span>
          </div>
          {nextAppt ? (
            <>
              <p className="text-[15px] font-bold leading-snug">
                {t("next", {
                  name: patientLabel(nextAppt),
                  time: isToday(nextAppt.scheduledAt)
                    ? new Date(nextAppt.scheduledAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
                    : new Date(nextAppt.scheduledAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }),
                })}
              </p>
              <p className="text-[12.5px] text-white/75 mt-0.5">
                {tc("typeLong", { type: nextAppt.consultType })}
                {" · "}{minutesTo(nextAppt.scheduledAt) > 0 ? formatTimeUntil(minutesTo(nextAppt.scheduledAt)) : t("dueNow")}
              </p>
            </>
          ) : (
            <p className="text-[15px] font-bold">{t("noMoreToday")}</p>
          )}
          <div className="h-px bg-white/15 my-3.5" />
          <div className={cn("grid gap-2", isStaff ? "grid-cols-1" : "grid-cols-3")}>
            {!isStaff && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">{t("earningsToday")}</p>
                <p className="text-[15px] font-extrabold mt-0.5">₹{todayEarnings.toLocaleString("en-IN")}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">{t("totalConsultations")}</p>
              <p className="text-[15px] font-extrabold mt-0.5">{Math.max(past.counts.COMPLETED ?? 0, completedAll.length)}</p>
            </div>
            {!isStaff && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">{t("rating")}</p>
                <p className="text-[15px] font-extrabold mt-0.5">{(profile?.avgRating ?? 0).toFixed(1)} / 5</p>
              </div>
            )}
          </div>
        </div>

        {/* Past visits still open — closing them keeps the queue, "Next" and
            earnings honest. Complete opens the visit's prescription form in
            Upcoming; no-show confirms first. */}
        {overdue.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <p className="font-bold text-amber-900 text-sm">
                  {t("overdueTitle", { count: overdue.length })}
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  {t("overdueHint")}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {overdue.slice(0, 5).map((a) => {
                const homeNotArrived = a.consultType === "HOME" && a.travelStatus !== "ARRIVED";
                const unpaidOnline = a.paymentMethod === "ONLINE" && a.paymentStatus !== "PAID";
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl border border-amber-100 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{patientLabel(a)}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(a.scheduledAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                        {" · "}{tc("typeShort", { type: a.consultType })}
                        {homeNotArrived ? ` · ${isStaff ? t("doctorNotArrived") : t("markArrivedFirst")}` : unpaidOnline ? ` · ${t("notPaidYet")}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {homeNotArrived ? (
                        <button onClick={() => jumpToCard(a.id)} className="btn-secondary py-1.5 px-3 text-xs">
                          {t("openVisit")}
                        </button>
                      ) : (
                        <>
                          {!isStaff && !unpaidOnline && (
                            <button onClick={() => { setCompletingId(a.id); jumpToCard(a.id); }} className="btn-primary py-1.5 px-3 text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" /> {t("complete")}
                            </button>
                          )}
                          {unpaidOnline && (
                            <button onClick={() => setPayQrFor(a)} className="btn-secondary py-1.5 px-3 text-xs text-amber-700 border-amber-200">
                              <QrCode className="w-3.5 h-3.5" /> {t("payQr")}
                            </button>
                          )}
                          <button onClick={() => setNoShowTarget(a)} className="btn-secondary py-1.5 px-3 text-xs text-amber-700 border-amber-200">
                            <UserX className="w-3.5 h-3.5" /> {t("noShow")}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {overdue.length > 5 && (
              <p className="text-xs text-amber-800 mt-2">{t("overdueMore", { count: overdue.length - 5 })}</p>
            )}
            {isStaff && <p className="text-xs text-amber-800 mt-2">{t("onlyDoctorCompletes")}</p>}
          </div>
        )}

        {/* Today's Timeline — a calendar-style at-a-glance view of the day's
            shape, complementing the flat sorted lists below rather than
            replacing them: tapping a block jumps to the same appointment's
            full card further down, where the real actions live. */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <button
            type="button"
            onClick={() => setTimelineOpen((o) => !o)}
            className="w-full px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-indigo-500" />
              <h2 className="font-bold text-slate-800">{t("timeline")}</h2>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", timelineOpen && "rotate-180")} />
          </button>
          {timelineOpen && (
            <div className="p-4">
              {timelineItems.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">{t("noAppointmentsToday")}</p>
              ) : (
                <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
                  <div className="relative" style={{ height: timelineTotalHeight }}>
                    {timelineHours.map((h) => (
                      <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: (h - timelineStartHour) * TIMELINE_HOUR_HEIGHT }}>
                        <span className="flex-shrink-0 text-[10px] font-semibold text-slate-400 -translate-y-1/2" style={{ width: TIMELINE_LABEL_WIDTH }}>
                          {hourLabel(h)}
                        </span>
                        <div className="flex-1 border-t border-slate-100" />
                      </div>
                    ))}
                    {nowMin >= timelineStartHour * 60 && nowMin <= timelineEndHour * 60 && (
                      <div className="absolute right-0 flex items-center gap-1 z-10" style={{ top: minutesToTimelineTop(nowMin), left: TIMELINE_LABEL_WIDTH }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                        <div className="flex-1 h-px bg-red-400" />
                      </div>
                    )}
                    {timelinePlacements.map(({ appt: a, startMin, col, cols }) => {
                      const Icon = TYPE_ICON[a.consultType] ?? Stethoscope;
                      const isPending = a.status === "PENDING_APPROVAL";
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => jumpToCard(a.id)}
                          className={cn(
                            "absolute rounded-lg px-2 py-1 text-left overflow-hidden border transition-colors",
                            isPending
                              ? "bg-amber-50 border-amber-200 border-dashed hover:bg-amber-100"
                              : "bg-teal-50 border-teal-200 hover:bg-teal-100"
                          )}
                          style={{
                            top: minutesToTimelineTop(startMin),
                            height: (TIMELINE_BLOCK_MINUTES / 60) * TIMELINE_HOUR_HEIGHT - 3,
                            left: `calc(${TIMELINE_LABEL_WIDTH}px + (100% - ${TIMELINE_LABEL_WIDTH}px) * ${col} / ${cols})`,
                            width: `calc((100% - ${TIMELINE_LABEL_WIDTH}px) / ${cols} - 4px)`,
                          }}
                        >
                          <div className={cn("flex items-center gap-1 text-[11px] font-bold leading-tight", isPending ? "text-amber-700" : "text-teal-700")}>
                            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", timelineDotColor(a.status))} />
                            <Icon className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{patientLabel(a)}</span>
                          </div>
                          <div className={cn("text-[10px] truncate", isPending ? "text-amber-600" : "text-teal-600")}>
                            {new Date(a.scheduledAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="input-field pl-10 pr-10"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={t("clearSearch")}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filters — date range chips, then type / clinic / status */}
        <div className="mb-6">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label={t("filters.label")}>
            {QUEUE_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, range: r }))}
                aria-pressed={filters.range === r}
                className={cn(
                  "tap-44-y flex-shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors",
                  filters.range === r ? "bg-teal-600 border-teal-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {t(`filters.range.${r}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2 flex-wrap items-center">
            <select
              aria-label={t("filters.type")}
              className="input-field w-auto py-1.5 pl-3 pr-8 text-xs"
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as QueueFilters["type"] }))}
            >
              {QUEUE_TYPES.map((ty) => (
                <option key={ty} value={ty}>{ty === "ALL" ? t("filters.allTypes") : tc("typeShort", { type: ty })}</option>
              ))}
            </select>
            {clinicOptions.length > 1 && (
              <select
                aria-label={t("filters.clinic")}
                className="input-field w-auto max-w-[12rem] py-1.5 pl-3 pr-8 text-xs"
                value={filters.clinicId}
                onChange={(e) => setFilters((f) => ({ ...f, clinicId: e.target.value }))}
              >
                <option value="ALL">{t("filters.allClinics")}</option>
                {clinicOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            )}
            <select
              aria-label={t("filters.status")}
              className="input-field w-auto py-1.5 pl-3 pr-8 text-xs"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as QueueFilters["status"] }))}
            >
              {QUEUE_STATUSES.map((st) => <option key={st} value={st}>{t(`filters.statusOption.${st}`)}</option>)}
            </select>
            {filtersOn && (
              <button type="button" onClick={() => setFilters(DEFAULT_QUEUE_FILTERS)} className="text-xs font-semibold text-teal-600 hover:underline px-1">
                {t("filters.clear")}
              </button>
            )}
          </div>
          {/* A history-only status with nothing loaded would otherwise leave a blank page. */}
          {filtersOn && !loadingAppts && ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(filters.status)
            && completed.length + cancelled.length + noShow.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">{t("filters.nothingMatches")}</p>
          )}
        </div>

        {/* Pending Requests */}
        {showSection("PENDING_APPROVAL") && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Inbox className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-slate-800">{t("pendingRequests")}</h2>
              {pending.length > 0 && <span className="badge badge-warning">{t("newCount", { count: pending.length })}</span>}
            </div>
            {pending.length > 1 && (
              <button onClick={() => setConfirmingBulkAccept(true)} className="btn-secondary py-1.5 px-3 text-xs gap-1">
                <ThumbsUp className="w-3.5 h-3.5" /> {t("acceptAllCount", { count: pending.length })}
              </button>
            )}
          </div>
          {bulkNotice && <p className="px-6 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border-b border-amber-100">{bulkNotice}</p>}
          <div className="divide-y divide-slate-50">
            {loadingAppts && apptsError ? (
              <div className="p-4"><LoadError error={apptsError} onRetry={retryAppointments} retrying={apptsRetrying} /></div>
            ) : loadingAppts ? (
              <div className="p-6 space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">{search || filtersOn ? t("noPendingMatch") : t("noPending")}</p>
            ) : (
              pending.map((a) => {
                const Icon = TYPE_ICON[a.consultType] ?? Stethoscope;
                return (
                  <div
                    key={a.id}
                    ref={(el) => { cardRefs.current[a.id] = el; }}
                    className={cn("px-4 sm:px-6 py-4 transition-colors duration-700", highlightId === a.id && "bg-teal-50")}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50">
                        <Icon className="w-5 h-5 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                          {patientLabel(a)}
                          {a.relation !== "Self" && (
                            <span className="badge badge-gray text-[10px]">{tc("relationOf", { relation: a.relation, name: a.patient.name })}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {new Date(a.scheduledAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} · {tc("typeShort", { type: a.consultType })}
                        </div>
                        <div className="text-sm text-slate-600 mt-0.5">{a.symptoms}</div>
                        <VitalsChip a={a} />
                        {a.allergies && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {t("allergies", { list: a.allergies })}
                          </div>
                        )}
                        <VisitAddressLine visit={a.visit} />
                        <ContactLinks mobile={a.patient.mobile} />
                        {respondError?.id === a.id && (
                          <div className="text-xs text-red-600 mt-1">{respondError.message}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2.5 mt-3">
                      <button onClick={() => setRejectTarget(a)} disabled={respondingId === a.id} className="btn-secondary flex-1 justify-center text-red-500 border-red-200 hover:bg-red-50">
                        <ThumbsDown className="w-4 h-4" /> {t("reject")}
                      </button>
                      <button onClick={() => setAcceptTarget(a)} disabled={respondingId === a.id} className="btn-primary flex-[1.4] justify-center">
                        {respondingId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />} {t("accept")}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        )}

        {/* Upcoming Appointments */}
        {showSection("SCHEDULED") && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-teal-500" />
            <h2 className="font-bold text-slate-800">{t("upcomingAppointments")}</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {loadingAppts && apptsError ? (
              // The Retry card is in Pending Requests above.
              <p className="text-sm text-slate-400 text-center py-10">{t("couldntLoad")}</p>
            ) : loadingAppts ? (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
              </div>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">{search || filtersOn ? t("noUpcomingMatch") : t("noUpcoming")}</p>
            ) : (
              (upcomingExpanded ? upcoming : upcoming.slice(0, PAGE_SIZE)).map((a) => {
                const Icon = TYPE_ICON[a.consultType] ?? Stethoscope;
                const visitUrl = visitNavUrl(a.visit);
                // One primary action per visit instead of a row of small
                // buttons — a home visit needs the journey moved along first,
                // otherwise it's whatever unlocks the consult itself.
                const readyToComplete = a.consultType !== "HOME" || a.travelStatus === "ARRIVED";
                const paymentBlocked = a.paymentMethod === "ONLINE" && a.paymentStatus !== "PAID";
                const unlockSec = a.consultType === "VIDEO" ? videoUnlockRemainingSec(a, now) : 0;
                return (
                  <div
                    key={a.id}
                    ref={(el) => { cardRefs.current[a.id] = el; }}
                    className={cn("px-3 sm:px-6 py-4 hover:bg-slate-50/70 transition-colors duration-700", highlightId === a.id && "bg-teal-50")}
                  >
                    <div className="flex gap-3">
                      <div className="w-11 flex-shrink-0 pt-0.5 text-right">
                        <div className="text-[13px] font-bold text-slate-700 leading-tight">
                          {new Date(a.scheduledAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(/\s?[AP]M$/i, "")}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-400 leading-tight">
                          {new Date(a.scheduledAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).match(/[AP]M$/i)?.[0]}
                        </div>
                        {/* Any other day needs its date — the list now spans past and future. */}
                        {!isToday(a.scheduledAt) && (
                          <div className="text-[10px] font-semibold text-slate-500 leading-tight mt-0.5">
                            {new Date(a.scheduledAt).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2.5">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-50">
                            <Icon className="w-4.5 h-4.5 text-teal-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                              {patientLabel(a)}
                              {a.relation !== "Self" && (
                                <span className="badge badge-gray text-[10px]">{tc("relationOf", { relation: a.relation, name: a.patient.name })}</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">{tc("typeLong", { type: a.consultType })}</div>
                            <div className="text-sm text-slate-600 mt-0.5">{a.symptoms}</div>
                            <VitalsChip a={a} />
                            {a.allergies && (
                              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {t("allergies", { list: a.allergies })}
                              </div>
                            )}
                            <VisitAddressLine visit={a.visit} />
                            <ContactLinks mobile={a.patient.mobile} />
                            <div className={`text-xs mt-1 flex items-center gap-1 flex-wrap ${paymentBlocked ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                              <IndianRupee className="w-3 h-3" /> {a.amount} · {
                                a.paymentMethod === "ONLINE"
                                  ? (a.paymentStatus === "PAID" ? t("paidOnline") : t("paymentPending"))
                                  : a.paymentStatus === "PAID" ? t("paidCash") : t("cashPayment")
                              }
                              {a.bookedById && <span className="badge badge-gray text-[10px] ml-1">{t("walkInBadge")}</span>}
                              {paymentBlocked && a.status === "SCHEDULED" && (
                                <button
                                  type="button"
                                  onClick={() => setPayQrFor(a)}
                                  className="ml-1 inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
                                >
                                  <QrCode className="w-3 h-3" /> {t("payQr")}
                                </button>
                              )}
                            </div>
                            {a.consultType === "HOME" && a.travelStatus === "ON_THE_WAY" && (
                              <div className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t("sharingLocation")}
                              </div>
                            )}
                            {a.consultType === "HOME" && a.travelStatus === "ARRIVED" && (
                              <div className="inline-flex items-center gap-1 text-xs text-slate-500 font-semibold mt-1">
                                <MapPinCheck className="w-3 h-3" /> {t("markedArrived")}
                              </div>
                            )}
                            {isOverdue(a, now) && (
                              <div className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 font-semibold mt-1 ml-1">
                                <AlertTriangle className="w-3 h-3" /> {t("pastOverdue")}
                              </div>
                            )}
                          </div>
                        </div>
                        {a.requestedScheduledAt && (
                          <RescheduleRequestBox appointmentId={a.id} requestedAt={a.requestedScheduledAt} onDone={loadAppointments} />
                        )}

                        {journeyError?.id === a.id && (
                          <div className="text-xs text-red-600 mt-2">{journeyError.message}</div>
                        )}
                        <div className="flex items-center gap-2 mt-3">
                          {/* Travelling and the video call are the doctor's own (the travel
                              API and /doctor/video refuse STAFF) — a receptionist only sees status. */}
                          {isStaff && a.consultType === "HOME" && (
                            <span className="flex-1 h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-sm font-semibold flex items-center justify-center gap-1.5">
                              <Car className="w-4 h-4" />
                              {a.travelStatus === "ARRIVED" ? t("doctorArrived") : a.travelStatus === "ON_THE_WAY" ? t("doctorOnWay") : t("doctorNotLeft")}
                            </span>
                          )}
                          {!isStaff && a.consultType === "HOME" && a.travelStatus === "NOT_STARTED" && (
                            <button
                              // Unpaid online: straight to the server, whose refusal (and the
                              // patient's pay reminder) brings up the unpaid warning instead.
                              onClick={() => (paymentBlocked ? void startJourney(a.id) : setJourneyConfirm({ appt: a, action: "start" }))}
                              disabled={startingJourneyId === a.id}
                              className={cn("btn-secondary flex-1 h-11 justify-center", paymentBlocked ? "text-red-700 border-red-200 hover:bg-red-50" : "text-blue-600 border-blue-200 hover:bg-blue-50")}
                            >
                              {startingJourneyId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />} {t("startJourney")}
                            </button>
                          )}
                          {!isStaff && a.consultType === "HOME" && a.travelStatus === "ON_THE_WAY" && (
                            <button onClick={() => markArrived(a.id)} className="btn-secondary flex-1 h-11 justify-center text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                              <MapPinCheck className="w-4 h-4" /> {t("markArrived")}
                            </button>
                          )}
                          {!isStaff && a.consultType === "HOME" && a.travelStatus === "ON_THE_WAY" && (
                            <button onClick={() => setJourneyConfirm({ appt: a, action: "stop" })} className="btn-secondary h-11 px-3 justify-center text-slate-500 text-xs" title={t("stopTitle")}>
                              {t("stop")}
                            </button>
                          )}
                          {!isStaff && a.consultType === "VIDEO" && a.paymentStatus === "PAID" && (
                            unlockSec > 0 ? (
                              <span className="flex-1 h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-sm font-semibold flex items-center justify-center gap-1.5 opacity-70">
                                <Loader2 className="w-4 h-4 animate-spin" /> {t("unlockingIn", { seconds: unlockSec })}
                              </span>
                            ) : (
                              <Link href={`/doctor/video/${a.id}`} className="btn-primary flex-1 h-11 justify-center">
                                <Video className="w-4 h-4" /> {t("joinVideo")}
                              </Link>
                            )
                          )}
                          {readyToComplete && !isStaff && (
                            paymentBlocked ? (
                              <span className="flex-1 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold flex items-center justify-center gap-1.5" title={t("awaitingPaymentTitle")}>
                                <Clock className="w-4 h-4" /> {t("awaitingPayment")}
                              </span>
                            ) : (
                              <button onClick={() => setCompletingId(completingId === a.id ? null : a.id)} className="btn-primary flex-1 h-11 justify-center">
                                <FileText className="w-4 h-4" /> {t("startPrescription")}
                              </button>
                            )
                          )}

                          <Link href={`/doctor/chat/${a.id}`} className="relative w-11 h-11 rounded-xl border border-slate-100 bg-white flex items-center justify-center flex-shrink-0 hover:bg-slate-50 transition-colors" title={t("chatWithPatient")}>
                            <MessageCircle className="w-4 h-4 text-slate-500" />
                            {a.unreadMessageCount > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border border-white text-white text-[10px] font-bold flex items-center justify-center">
                                {a.unreadMessageCount > 9 ? "9+" : a.unreadMessageCount}
                              </span>
                            )}
                          </Link>

                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(e) => {
                                if (openMenu?.id === a.id) { setOpenMenu(null); return; }
                                const rect = e.currentTarget.getBoundingClientRect();
                                setOpenMenu({ id: a.id, top: rect.bottom + 8, right: window.innerWidth - rect.right });
                              }}
                              className="w-11 h-11 rounded-xl border border-slate-100 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors"
                              title={t("moreActions")}
                            >
                              <MoreHorizontal className="w-4 h-4 text-slate-500" />
                            </button>
                            {openMenu?.id === a.id && createPortal(
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setOpenMenu(null)} />
                                <div
                                  className="fixed w-52 bg-white rounded-xl border border-slate-100 shadow-lg z-40 overflow-hidden py-1"
                                  style={{ top: openMenu.top, right: openMenu.right }}
                                >
                                  {!isStaff && (
                                    <Link href={historyHref(a)} onClick={() => setOpenMenu(null)} className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                      <History className="w-4 h-4 text-slate-400" /> {t("patientHistory")}
                                    </Link>
                                  )}
                                  {visitUrl && !isStaff && (
                                    <a
                                      href={visitUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => setOpenMenu(null)}
                                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      <Navigation className="w-4 h-4 text-slate-400" /> {t("navigateToPatient")}
                                    </a>
                                  )}
                                  {canMarkNoShow(a, now) && (
                                    <button
                                      onClick={() => { setOpenMenu(null); setNoShowTarget(a); }}
                                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-amber-600 hover:bg-amber-50 text-left"
                                    >
                                      <UserX className="w-4 h-4" /> {t("markNoShow")}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { setOpenMenu(null); setCancelTarget(a); }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 text-left"
                                  >
                                    <XCircle className="w-4 h-4" /> {t("cancelAppointment")}
                                  </button>
                                </div>
                              </>,
                              document.body
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                    {!isStaff && completingId === a.id && (
                      <CompleteVisitForm
                        appt={a}
                        onCancel={() => setCompletingId(null)}
                        onDone={() => { setCompletingId(null); loadAppointments(); setRxFor({ id: a.id, patientId: a.patientId, justCompleted: true }); }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
          {!upcomingExpanded && upcoming.length > PAGE_SIZE && (
            <button onClick={() => setUpcomingExpanded(true)} className="w-full py-3 text-xs font-semibold text-teal-600 hover:bg-teal-50 border-t border-slate-100 transition-colors">
              {t("loadMore", { count: upcoming.length - PAGE_SIZE })}
            </button>
          )}
        </div>

        )}

        {/* Recent Completed */}
        {completed.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h2 className="font-bold text-slate-800">{t("recentCompleted")}</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {(completedExpanded ? completed : completed.slice(0, PAGE_SIZE)).map((a) => (
                <div key={a.id} className="px-6 py-3.5 flex items-center justify-between">
                  <div>
                    {isStaff ? (
                      <span className="font-semibold text-slate-800 text-sm">{patientLabel(a)}</span>
                    ) : (
                      <Link href={historyHref(a)} className="font-semibold text-slate-800 text-sm hover:underline hover:text-teal-600">
                        {patientLabel(a)}
                      </Link>
                    )}
                    {a.relation !== "Self" && (
                      <span className="badge badge-gray text-[10px] ml-1.5">{tc("relationOf", { relation: a.relation, name: a.patient.name })}</span>
                    )}
                    <div className="text-xs text-slate-400">
                      {new Date(a.scheduledAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Kolkata" })} · {tc("typeShort", { type: a.consultType })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isStaff && <div className="text-sm font-bold text-slate-700">₹{a.amount - a.platformFee}</div>}
                    {!isStaff && (
                      <button type="button" onClick={() => setRxFor({ id: a.id, patientId: a.patientId })} className="w-9 h-9 rounded-xl border border-slate-100 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors" title={t("prescriptionTitle")} aria-label={t("prescription")}>
                        <FileText className="w-4 h-4 text-teal-600" />
                      </button>
                    )}
                    {/* Readable after completion; open for follow-up questions for a few days. */}
                    <Link href={`/doctor/chat/${a.id}`} className="relative w-9 h-9 rounded-xl border border-slate-100 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors" title={t("chatWithPatient")}>
                      <MessageCircle className="w-4 h-4 text-slate-500" />
                      {a.unreadMessageCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border border-white text-white text-[10px] font-bold flex items-center justify-center">
                          {a.unreadMessageCount > 9 ? "9+" : a.unreadMessageCount}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            {!completedExpanded && completed.length > PAGE_SIZE && (
              <button onClick={() => setCompletedExpanded(true)} className="w-full py-3 text-xs font-semibold text-teal-600 hover:bg-teal-50 border-t border-slate-100 transition-colors">
                {t("loadMore", { count: completed.length - PAGE_SIZE })}
              </button>
            )}
          </div>
        )}

        {/* Cancelled */}
        {cancelled.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" />
              <h2 className="font-bold text-slate-800">{t("cancelledAppointments")}</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {(cancelledExpanded ? cancelled : cancelled.slice(0, PAGE_SIZE)).map((a) => (
                <div key={a.id} className="px-6 py-3.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-500 text-sm">{patientLabel(a)}</span>
                    {a.relation !== "Self" && (
                      <span className="badge badge-gray text-[10px] ml-1.5">{tc("relationOf", { relation: a.relation, name: a.patient.name })}</span>
                    )}
                    <div className="text-xs text-slate-400">
                      {new Date(a.scheduledAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Kolkata" })} · {tc("typeShort", { type: a.consultType })}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="badge badge-danger">{t("cancelledBadge")}</span>
                    {/* A referral on a cancelled consultation is void (src/lib/nurseReferral.ts) — let the doctor clear it. */}
                    {a.referralGiven && !isStaff && (
                      <button
                        type="button"
                        onClick={() => removeReferral(a.id)}
                        disabled={removingReferral === a.id}
                        className="text-[11px] font-semibold text-red-500 hover:underline disabled:opacity-50"
                        title={t("referralInvalid", { service: a.referralGiven.service.name })}
                      >
                        {removingReferral === a.id ? t("removing") : t("removeReferral", { service: a.referralGiven.service.name })}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!cancelledExpanded && cancelled.length > PAGE_SIZE && (
              <button onClick={() => setCancelledExpanded(true)} className="w-full py-3 text-xs font-semibold text-teal-600 hover:bg-teal-50 border-t border-slate-100 transition-colors">
                {t("loadMore", { count: cancelled.length - PAGE_SIZE })}
              </button>
            )}
          </div>
        )}

        {/* No-Show — kept separate from Cancelled since this wasn't the doctor's doing */}
        {noShow.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <UserX className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-slate-800">{t("patientNoShows")}</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {(noShowExpanded ? noShow : noShow.slice(0, PAGE_SIZE)).map((a) => (
                <div key={a.id} className="px-6 py-3.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-500 text-sm">{patientLabel(a)}</span>
                    {a.relation !== "Self" && (
                      <span className="badge badge-gray text-[10px] ml-1.5">{tc("relationOf", { relation: a.relation, name: a.patient.name })}</span>
                    )}
                    <div className="text-xs text-slate-400">
                      {new Date(a.scheduledAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Kolkata" })} · {tc("typeShort", { type: a.consultType })}
                    </div>
                    {/* A no-show is worth a call to rebook. */}
                    <ContactLinks mobile={a.patient.mobile} />
                  </div>
                  <span className="badge badge-warning">{t("noShowBadge")}</span>
                </div>
              ))}
            </div>
            {!noShowExpanded && noShow.length > PAGE_SIZE && (
              <button onClick={() => setNoShowExpanded(true)} className="w-full py-3 text-xs font-semibold text-teal-600 hover:bg-teal-50 border-t border-slate-100 transition-colors">
                {t("loadMore", { count: noShow.length - PAGE_SIZE })}
              </button>
            )}
          </div>
        )}

        {/* History is paged from the server — older visits on request. */}
        {past.hasMore && (
          <button
            onClick={() => {
              setCompletedExpanded(true); setCancelledExpanded(true); setNoShowExpanded(true);
              void past.loadMore();
            }}
            disabled={past.loadingMore}
            className="btn-secondary w-full py-2.5 text-sm mb-6"
          >
            {past.loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : t("loadOlder")}
          </button>
        )}
      </PullToRefresh>

      {/* Cancel confirmation */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-800">{t(cancelTarget.bookedById ? "cancelDialog.walkInTitle" : "cancelDialog.title")}</h3>
            </div>
            <p className={cn("text-sm text-slate-500", isLateCancellation(cancelTarget) ? "mb-3" : "mb-5")}>
              {t(cancelTarget.bookedById ? "cancelDialog.walkInBody" : "cancelDialog.body", { name: patientLabel(cancelTarget), when: new Date(cancelTarget.scheduledAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) })}
            </p>
            {isLateCancellation(cancelTarget) && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{t("cancelDialog.late")}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setCancelTarget(null)} className="btn-secondary flex-1">
                {t("cancelDialog.keep")}
              </button>
              <button onClick={confirmCancel} disabled={cancelling} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {cancelling ? t("cancelDialog.busy") : t(cancelTarget.bookedById ? "cancelDialog.walkInConfirm" : "cancelDialog.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {rxFor && (
        <PrescriptionViewer appointmentId={rxFor.id} patientId={rxFor.patientId} justCompleted={rxFor.justCompleted} onClose={() => setRxFor(null)} />
      )}

      {/* Pay-by-phone QR for an unpaid online visit */}
      {payQrFor && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 flex items-end sm:items-center justify-center p-4" onClick={() => setPayQrFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{patientLabel(payQrFor)}</p>
                <p className="text-xs text-slate-500">{t("payQrDialog.subtitle")}</p>
              </div>
              <button type="button" onClick={() => setPayQrFor(null)} className="text-slate-400 hover:text-slate-700" aria-label={tc("close")}><X className="w-5 h-5" /></button>
            </div>
            <PaymentQrPanel
              appointmentId={payQrFor.id}
              amount={payQrFor.amount}
              patientMobile={payQrFor.patient.mobile}
              canSwitchToCash={!!payQrFor.bookedById}
              onPaid={() => { void loadAppointments(); }}
              onSwitchedToCash={() => { setPayQrFor(null); void loadAppointments(); }}
            />
          </div>
        </div>
      )}

      {/* No-show confirmation */}
      {noShowTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <UserX className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-slate-800">{t("noShowDialog.title")}</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              {t("noShowDialog.body", { name: patientLabel(noShowTarget), when: new Date(noShowTarget.scheduledAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) })}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setNoShowTarget(null)} className="btn-secondary flex-1">
                {t("goBack")}
              </button>
              <button onClick={confirmNoShow} disabled={markingNoShow} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {markingNoShow ? t("noShowDialog.busy") : t("noShowDialog.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start / stop journey confirmation */}
      {journeyConfirm && (
        <ConfirmDialog
          icon={Car}
          tone={journeyConfirm.action === "start" ? "primary" : "warning"}
          title={journeyConfirm.action === "start" ? t("journeyDialog.startTitle", { name: patientLabel(journeyConfirm.appt) }) : t("journeyDialog.stopTitle")}
          message={journeyConfirm.action === "start" ? t("journeyDialog.startMessage") : t("journeyDialog.stopMessage")}
          confirmLabel={journeyConfirm.action === "start" ? t("journeyDialog.startLabel") : t("journeyDialog.stopLabel")}
          busyLabel={journeyConfirm.action === "start" ? t("journeyDialog.starting") : t("journeyDialog.stopping")}
          busy={startingJourneyId === journeyConfirm.appt.id}
          onCancel={() => setJourneyConfirm(null)}
          onConfirm={async () => {
            const { appt, action } = journeyConfirm;
            if (action === "start") await startJourney(appt.id);
            else await stopJourney(appt.id);
            setJourneyConfirm(null);
          }}
        />
      )}

      {unpaidStart && (
        <UnpaidJourneyWarning
          info={unpaidStart}
          busy={startingJourneyId === unpaidStart.id}
          onClose={() => setUnpaidStart(null)}
          onGoAnyway={() => { void startJourney(unpaidStart.id, true); }}
        />
      )}

      {/* Bulk accept confirmation */}
      {confirmingBulkAccept && (
        <ConfirmDialog
          icon={ThumbsUp}
          title={t("bulkDialog.title", { count: pending.length })}
          message={t("bulkDialog.message")}
          confirmLabel={t("bulkDialog.confirm")}
          busyLabel={t("bulkDialog.busy")}
          tone="success"
          busy={bulkAccepting}
          onCancel={() => setConfirmingBulkAccept(false)}
          onConfirm={confirmBulkAccept}
        />
      )}

      {/* Accept confirmation */}
      {acceptTarget && (
        <ConfirmDialog
          icon={ThumbsUp}
          title={t("acceptDialog.title", { name: patientLabel(acceptTarget) })}
          message={t("acceptDialog.message", { type: acceptTarget.consultType })}
          confirmLabel={t("acceptDialog.confirm")}
          busyLabel={t("acceptDialog.busy")}
          tone="success"
          busy={respondingId === acceptTarget.id}
          onCancel={() => setAcceptTarget(null)}
          onConfirm={async () => {
            // A failure shows inline on the request's card.
            await respond(acceptTarget.id, "SCHEDULED");
            setAcceptTarget(null);
          }}
        />
      )}

      {/* Reject confirmation */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <ThumbsDown className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-800">{t("rejectDialog.title")}</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              {t("rejectDialog.body", { name: patientLabel(rejectTarget) })}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRejectTarget(null)} className="btn-secondary flex-1">
                {t("rejectDialog.keep")}
              </button>
              <button onClick={confirmReject} disabled={rejecting} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {rejecting ? t("rejectDialog.busy") : t("rejectDialog.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
