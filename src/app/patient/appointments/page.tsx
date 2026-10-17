"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, CalendarClock, Stethoscope, Home, Building2, Video, FileText, Star, X, Wallet, CreditCard, RotateCcw, Clock, Pill, ThumbsDown, CreditCard as CardIcon, Car, MapPinCheck, MapPin, MessageCircle, Navigation, UserCheck, HeartPulse, CheckCircle2, Activity, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn, formatDoctorName, formatProviderName } from "@/lib/utils";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import PrescriptionDownloadButton from "@/components/patient/PrescriptionDownloadButton";
import { downloadOrShareUrl } from "@/lib/nativeDownload";
import { isNative } from "@/lib/platform";
import { playMessageChime } from "@/lib/playNotificationSound";
import { VIDEO_UNLOCK_DELAY_SECONDS } from "@/lib/videoCall";
import { useResync } from "@/hooks/useResync";
import { intervalLabel } from "@/lib/nursePackage";
import { vitalsSummary, type VitalsInput } from "@/lib/vitals";
import PullToRefresh from "@/components/PullToRefresh";
import TimeSlotPicker from "@/components/patient/TimeSlotPicker";

interface Medicine {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
}

interface Attachment {
  id: string;
  url: string;
  fileName: string | null;
}

interface Appointment {
  id: string;
  doctorId: string;
  clinicId?: string | null;
  status: string;
  consultType: string;
  symptoms: string;
  patientName: string | null;
  relation: string;
  amount: number;
  discountAmount: number;
  couponCode: string | null;
  paymentMethod: string;
  paymentStatus: string;
  paidAt: string | null;
  travelStatus: string;
  unreadMessageCount: number;
  attachments: Attachment[];
  doctorNotes: string | null;
  scheduledAt: string;
  requestedScheduledAt?: string | null; // pending new time for an accepted appointment
  createdAt: string;
  providerType?: string; // "NURSE" for nurse bookings
  serviceName?: string | null;
  nurseServiceId?: string | null;
  visitOtp?: string | null;
  nurseService?: { kind: string; durationMinutes: number } | null;
  vitals?: (VitalsInput & { id: string; recordedAt: string; alertLevel: string })[];
  visitStartedAt?: string | null;
  visitStartNote?: string | null;
  packageIndex?: number | null;
  package?: { visits: number; intervalDays: number } | null;
  referralGiven?: { id: string; visits: number; intervalDays: number; instructions: string | null; service: { id: string; name: string }; bookings: { id: string }[] } | null;
  doctor: {
    name: string;
    doctorProfile: { specialty: string; clinicName: string | null; address: string | null; lat: number | null; lng: number | null } | null;
  };
  review: { id: string; rating: number; comment: string | null } | null;
  medicines: Medicine[];
  clinic: { name: string; address: string; lat: number; lng: number } | null;
  reassignedFromId: string | null;
  reassignedTo: { id: string; doctor: { name: string } } | null;
  reassignedFrom: { id: string; doctor: { name: string } } | null;
}

const TYPE_ICON: Record<string, React.ElementType> = { HOME: Home, CLINIC: Building2, VIDEO: Video };

const STATUS_BADGE: Record<string, string> = {
  PENDING_APPROVAL: "badge badge-warning",
  SCHEDULED: "badge badge-info",
  COMPLETED: "badge badge-success",
  CANCELLED: "badge badge-gray",
  REJECTED: "badge badge-danger",
  EXPIRED: "badge badge-gray",
  NO_SHOW: "badge badge-warning",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Waiting for doctor",
  SCHEDULED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Declined",
  EXPIRED: "Doctor was busy",
  NO_SHOW: "Missed (no-show)",
};

// Nurse bookings share these cards — swap the provider word where it shows.
function statusLabel(a: { status: string; providerType?: string }) {
  if (a.providerType === "NURSE") {
    if (a.status === "PENDING_APPROVAL") return "Waiting for nurse";
    if (a.status === "EXPIRED") return "Nurse was busy";
  }
  return STATUS_LABEL[a.status] ?? a.status;
}

const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Seconds left before a paid video appointment's "Join Video Consultation" button
// unlocks; 0 once VIDEO_UNLOCK_DELAY_SECONDS has passed since payment.
function videoUnlockRemainingSec(a: Appointment, now: number): number {
  if (!a.paidAt) return 0;
  const unlockAt = new Date(a.paidAt).getTime() + VIDEO_UNLOCK_DELAY_SECONDS * 1000;
  return Math.max(0, Math.ceil((unlockAt - now) / 1000));
}

// Google Maps directions link to a doctor's clinic, preferring precise coordinates over the address text.
function clinicDirectionsUrl(profile: { address: string | null; lat: number | null; lng: number | null } | null): string | null {
  if (!profile) return null;
  if (profile.lat != null && profile.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${profile.lat},${profile.lng}`;
  }
  if (profile.address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.address)}`;
  }
  return null;
}

function ReviewModal({ appointmentId, onClose, onSubmitted }: { appointmentId: string; onClose: () => void; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, rating, comment }),
    });
    setBusy(false);
    if (res.ok) onSubmitted();
    else setError((await res.json()).error ?? "Could not submit review.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-slate-900">Leave a Review</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-center gap-1.5 mb-4">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" onClick={() => setRating(s)}>
              <Star className={cn("w-8 h-8", s <= rating ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-200")} />
            </button>
          ))}
        </div>
        <textarea
          rows={3}
          className="input-field resize-none mb-4"
          placeholder="Share your experience (optional)…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button onClick={submit} disabled={busy} className="btn-primary w-full justify-center py-3">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit Review"}
        </button>
      </div>
    </div>
  );
}

// A home visit the doctor has already set off for (or reached) is a
// commitment happening right now — cancelling/rescheduling it in-app from
// here on needs to go through the doctor directly instead.
const homeVisitArrived = (a: Appointment) => a.consultType === "HOME" && a.travelStatus === "ARRIVED";
const homeVisitInProgress = (a: Appointment) => a.consultType === "HOME" && a.travelStatus !== "NOT_STARTED";
const canCancel = (a: Appointment) =>
  (a.status === "PENDING_APPROVAL" || a.status === "SCHEDULED") && !homeVisitArrived(a);
const canReschedule = (a: Appointment) =>
  (a.status === "PENDING_APPROVAL" || a.status === "SCHEDULED") && !homeVisitInProgress(a);

// Local datetime-local min value (now, floored to the minute)
function nowLocalInput() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function AppointmentCard({ a, patientId, now, onCancel, onReschedule, onWithdrawReschedule, onReview }: {
  a: Appointment;
  patientId: string;
  now: number;
  onCancel: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onWithdrawReschedule: (a: Appointment) => Promise<string | null>;
  onReview: (id: string) => void;
}) {
  const Icon = TYPE_ICON[a.consultType] ?? Stethoscope;
  const router = useRouter();
  const needsPayment = a.status === "SCHEDULED" && a.paymentMethod === "ONLINE" && a.paymentStatus === "PENDING";
  const timeLeftMs = REQUEST_TIMEOUT_MS - (now - new Date(a.createdAt).getTime());
  // A booking made for a future slot (more than the response window ahead)
  // isn't on the 30-min accept clock — the doctor has until the slot time.
  const scheduledForLater =
    new Date(a.scheduledAt).getTime() > new Date(a.createdAt).getTime() + REQUEST_TIMEOUT_MS;
  const [downloadingAtt, setDownloadingAtt] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const pendingNewTime = a.status === "SCHEDULED" && a.requestedScheduledAt ? a.requestedScheduledAt : null;

  // Web: the <a target="_blank"> opens the file as before. Native: <a> can't
  // open/download inside the WebView, so intercept and use the OS share sheet.
  const onAttachmentClick = (e: React.MouseEvent, att: Attachment, fileName: string) => {
    if (!isNative()) return;
    e.preventDefault();
    if (downloadingAtt) return;
    setDownloadingAtt(att.id);
    downloadOrShareUrl(att.url, fileName)
      .catch(() => {})
      .finally(() => setDownloadingAtt(null));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              {formatProviderName(a.doctor.name, a.providerType)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{a.providerType === "NURSE" ? `Nurse visit · ${a.serviceName ?? ""}` : a.doctor.doctorProfile?.specialty ?? ""}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {new Date(a.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </div>
            {a.relation !== "Self" && a.patientName && (
              <div className="text-xs text-blue-600 font-medium mt-0.5">For {a.patientName} ({a.relation})</div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={STATUS_BADGE[a.status] ?? "badge badge-gray"}>{statusLabel(a)}</span>
          <span className="text-sm font-bold text-slate-800">₹{a.amount}</span>
        </div>
      </div>

      {a.nurseService?.kind === "SHIFT" && (
        <p className="text-xs font-semibold text-violet-700 mb-1">
          {Math.round(a.nurseService.durationMinutes / 60)}-hour shift · ends {new Date(new Date(a.scheduledAt).getTime() + a.nurseService.durationMinutes * 60000).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
      {a.packageIndex && a.package && (
        <p className="text-xs font-semibold text-rose-600 mb-1">Visit {a.packageIndex} of {a.package.visits} · {intervalLabel(a.package.intervalDays)}</p>
      )}
      <p className="text-sm text-slate-600 mb-3">{a.symptoms}</p>

      {/* The nurse can only start the visit with this code — so it proves she's really at the door. */}
      {a.providerType === "NURSE" && a.status === "SCHEDULED" && a.visitOtp && !a.visitStartedAt && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-rose-700">Visit code</p>
            <p className="text-[11px] text-rose-700/80">Tell this to the nurse when she arrives — only then can she start. Booked for someone at home? Share it with them, or tell her on the phone.</p>
          </div>
          <span className="text-2xl font-extrabold tracking-[0.3em] text-rose-700 flex-shrink-0">{a.visitOtp}</span>
        </div>
      )}
      {a.providerType === "NURSE" && a.vitals && a.vitals.length > 0 && (
        <Link href="/patient/profile/vitals" className={cn(
          "rounded-xl border px-4 py-2.5 mb-3 text-xs flex items-center justify-between gap-2",
          a.vitals[0].alertLevel === "CRITICAL" ? "border-red-200 bg-red-50 text-red-800" : a.vitals[0].alertLevel === "WARNING" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"
        )}>
          <span className="flex items-center gap-1.5 min-w-0">
            {a.vitals[0].alertLevel === "NORMAL" ? <Activity className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
            <span className="truncate">Vitals: {vitalsSummary(a.vitals[0])}</span>
          </span>
          <span className="font-semibold flex-shrink-0">See trend →</span>
        </Link>
      )}
      {a.providerType === "NURSE" && a.visitStartedAt && a.visitStartNote && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 mb-3 text-xs text-amber-800">
          Started without your code: &ldquo;{a.visitStartNote}&rdquo;. If that wasn&apos;t you, contact Help &amp; Support.
        </div>
      )}

      {a.status === "PENDING_APPROVAL" && a.reassignedFromId && a.reassignedFrom && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-3 flex items-center gap-2">
          <UserCheck className="w-4 h-4 flex-shrink-0" />
          {formatDoctorName(a.reassignedFrom.doctor.name)} had an emergency and couldn&apos;t continue with your appointment, so we&apos;ve assigned you to {formatProviderName(a.doctor.name, a.providerType)} instead.
        </div>
      )}
      {a.status === "PENDING_APPROVAL" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-3 flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4 flex-shrink-0" />
            {scheduledForLater
              ? `Waiting for ${formatProviderName(a.doctor.name, a.providerType)} to confirm your scheduled appointment.`
              : `Waiting for ${formatProviderName(a.doctor.name, a.providerType)} to accept this request.`}
          </span>
          {!scheduledForLater && (
            <span className="text-xs font-mono font-semibold text-amber-700 flex-shrink-0">
              {timeLeftMs > 0 ? `${formatCountdown(timeLeftMs)} left` : "Expiring…"}
            </span>
          )}
        </div>
      )}
      {a.status === "CANCELLED" && a.reassignedTo && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-3 flex items-center gap-2">
          <UserCheck className="w-4 h-4 flex-shrink-0" />
          {formatProviderName(a.doctor.name, a.providerType)} had an emergency and couldn&apos;t continue with this appointment, so we&apos;ve assigned you to {formatDoctorName(a.reassignedTo.doctor.name)} instead — check your pending requests.
        </div>
      )}
      {a.status === "REJECTED" && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 mb-3 flex items-center gap-2">
          <ThumbsDown className="w-4 h-4 flex-shrink-0 text-slate-400" /> {formatProviderName(a.doctor.name, a.providerType)} was unable to accept this request. No payment was taken.
        </div>
      )}
      {a.status === "EXPIRED" && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 flex-shrink-0 text-slate-400" /> {formatProviderName(a.doctor.name, a.providerType)}{" "}didn&apos;t respond in time and may be too busy right now. No payment was taken — try booking again or choose another doctor.
        </div>
      )}
      {a.consultType === "CLINIC" &&
        ((a.status === "SCHEDULED" && a.paymentStatus === "PAID") || (a.status === "PENDING_APPROVAL" && a.reassignedFromId)) &&
        (a.clinic || clinicDirectionsUrl(a.doctor.doctorProfile)) && (
        <a
          href={(a.clinic ? clinicDirectionsUrl(a.clinic) : clinicDirectionsUrl(a.doctor.doctorProfile))!}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-sm text-teal-800 mb-3 flex items-center justify-between gap-2 hover:bg-teal-100 transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">
              {a.clinic?.name || a.doctor.doctorProfile?.clinicName || `${formatProviderName(a.doctor.name, a.providerType)}'s clinic`}
              {a.clinic?.address && <span className="text-teal-600"> — {a.clinic.address}</span>}
            </span>
          </span>
          <span className="font-semibold underline flex items-center gap-1 flex-shrink-0">
            <Navigation className="w-3.5 h-3.5" /> Get Directions
          </span>
        </a>
      )}
      {a.status === "SCHEDULED" && a.consultType === "HOME" && a.travelStatus === "ON_THE_WAY" && (
        <Link
          href={`/patient/track/${a.id}`}
          className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 mb-3 flex items-center justify-between gap-2 hover:bg-emerald-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Car className="w-4 h-4 flex-shrink-0" /> {formatProviderName(a.doctor.name, a.providerType)} is on the way
          </span>
          <span className="font-semibold underline flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> Track Live
          </span>
        </Link>
      )}
      {a.status === "SCHEDULED" && a.consultType === "HOME" && a.travelStatus === "ARRIVED" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-3 flex items-center gap-2">
          <MapPinCheck className="w-4 h-4 flex-shrink-0" /> {formatProviderName(a.doctor.name, a.providerType)} has arrived.
        </div>
      )}
      {needsPayment && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-3 flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <CardIcon className="w-4 h-4 flex-shrink-0" /> Payment pending — pay ₹{Math.max(0, a.amount - a.discountAmount)}{a.discountAmount > 0 ? ` (${a.couponCode} applied)` : ""} to confirm your consultation with {formatProviderName(a.doctor.name, a.providerType)}.
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="badge badge-gray">
          {a.paymentMethod === "ONLINE" ? <CreditCard className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
          {a.paymentMethod === "ONLINE" ? "Online" : "Cash"}
        </span>
        {a.status !== "REJECTED" && a.status !== "PENDING_APPROVAL" && (
          <span className={cn("badge", a.paymentStatus === "PAID" ? "badge-success" : "badge-warning")}>
            {a.paymentStatus}
          </span>
        )}
      </div>

      {a.doctorNotes && (
        <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 mb-3">
          <span className="font-semibold text-slate-700">{a.providerType === "NURSE" ? "Nurse's notes" : "Doctor's notes"}: </span>{a.doctorNotes}
        </div>
      )}

      {a.status === "COMPLETED" && a.medicines.length > 0 && (
        <div className="border border-slate-100 rounded-xl overflow-hidden mb-3">
          <div className="bg-slate-50 px-3 py-2 flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Pill className="w-3.5 h-3.5" /> Prescription
          </div>
          <div className="divide-y divide-slate-50">
            {a.medicines.map((m) => (
              <div key={m.id} className="px-3 py-2 text-sm">
                <span className="font-semibold text-slate-800">{m.name}</span>
                <span className="text-slate-500"> — {[m.dosage, m.frequency, m.duration].filter(Boolean).join(" · ")}</span>
                {m.instructions && <div className="text-xs text-slate-400 mt-0.5">{m.instructions}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {a.status === "COMPLETED" && a.referralGiven && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 mb-3">
          <p className="text-sm font-semibold text-rose-800 flex items-center gap-1.5"><HeartPulse className="w-4 h-4" />{formatProviderName(a.doctor.name, a.providerType)} recommends nurse care at home</p>
          <p className="text-xs text-rose-900/80 mt-0.5">
            {a.referralGiven.service.name} — {a.referralGiven.visits} visit{a.referralGiven.visits === 1 ? "" : "s"}{a.referralGiven.visits > 1 ? `, ${intervalLabel(a.referralGiven.intervalDays)}` : ""}
            {a.referralGiven.instructions ? ` · ${a.referralGiven.instructions}` : ""}
          </p>
          {a.referralGiven.bookings.length > 0 ? (
            <p className="text-xs font-semibold text-emerald-700 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Nurse booked</p>
          ) : (
            <Link href={`/patient/nurse?serviceId=${a.referralGiven.service.id}&referralId=${a.referralGiven.id}`} className="btn-primary py-2 px-3 text-xs mt-2 inline-flex">
              <HeartPulse className="w-3.5 h-3.5" /> Book a nurse
            </Link>
          )}
        </div>
      )}

      {pendingNewTime && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <p className="font-semibold flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
            New time requested: {new Date(pendingNewTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
          <p className="mt-0.5">Waiting for {formatProviderName(a.doctor.name, a.providerType)} to confirm. Your current time stays booked until then.</p>
          <button
            disabled={withdrawing}
            onClick={async () => {
              setWithdrawing(true);
              setWithdrawError((await onWithdrawReschedule(a)) ?? "");
              setWithdrawing(false);
            }}
            className="mt-1.5 font-semibold underline disabled:opacity-50"
          >
            {withdrawing ? "Withdrawing…" : "Keep my current time"}
          </button>
          {withdrawError && <p className="text-red-600 mt-1">{withdrawError}</p>}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {canReschedule(a) && (
          <button onClick={() => onReschedule(a)} className="btn-secondary py-2 px-3 text-xs">
            <CalendarClock className="w-3.5 h-3.5" /> Reschedule
          </button>
        )}
        {canCancel(a) && (
          <button onClick={() => onCancel(a)} className="btn-secondary py-2 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50">
            {a.status === "SCHEDULED" ? "Cancel Appointment" : "Cancel Request"}
          </button>
        )}
        {needsPayment && (
          <Link href={`/patient/payment?apptId=${a.id}`} className="btn-primary py-2 px-3 text-xs">
            <CardIcon className="w-3.5 h-3.5" /> Pay Now
          </Link>
        )}
        {needsPayment && a.consultType === "VIDEO" && (
          <span className="inline-flex items-center text-xs text-slate-400 py-2">
            Video call unlocks after payment
          </span>
        )}
        {a.status === "SCHEDULED" && (
          <Link href={`/patient/chat/${a.id}`} className="relative btn-secondary py-2 px-3 text-xs">
            <MessageCircle className="w-3.5 h-3.5" /> Chat
            {a.unreadMessageCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border border-white text-white text-[10px] font-bold flex items-center justify-center">
                {a.unreadMessageCount > 9 ? "9+" : a.unreadMessageCount}
              </span>
            )}
          </Link>
        )}
        {a.consultType === "VIDEO" && a.status === "SCHEDULED" && a.paymentStatus === "PAID" && (
          videoUnlockRemainingSec(a, now) > 0 ? (
            <span className="btn-secondary py-2 px-3 text-xs opacity-60 cursor-not-allowed">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Unlocking in {videoUnlockRemainingSec(a, now)}s
            </span>
          ) : (
            <Link href={`/patient/video/${a.id}`} className="btn-secondary py-2 px-3 text-xs">
              <Video className="w-3.5 h-3.5" /> Join Video Consultation
            </Link>
          )
        )}
        {a.status === "COMPLETED" && a.attachments.map((att, i) => {
          const label = a.attachments.length > 1 ? `File ${i + 1}` : "View Attached File";
          const fileName = att.fileName || att.url.split("/").pop()?.split("?")[0] || `attachment-${i + 1}`;
          return (
            <a
              key={att.id}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => onAttachmentClick(e, att, fileName)}
              className="btn-secondary py-2 px-3 text-xs"
            >
              {downloadingAtt === att.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5" />}
              {label}
            </a>
          );
        })}
        {/* Nurses can't issue prescriptions — their visit notes are shown on the card instead. */}
        {a.status === "COMPLETED" && a.providerType !== "NURSE" && (a.medicines.length > 0 || !!a.doctorNotes) && (
          <PrescriptionDownloadButton appointmentId={a.id} patientId={patientId} />
        )}
        {a.status === "COMPLETED" && !a.review && (
          <button onClick={() => onReview(a.id)} className="btn-secondary py-2 px-3 text-xs">
            <Star className="w-3.5 h-3.5" /> Leave a Review
          </button>
        )}
        {a.review && (
          <span className="text-xs text-slate-500 flex items-center gap-1 py-2">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> You rated {a.review.rating}/5
          </span>
        )}
        {a.status === "COMPLETED" && (
          <button
            onClick={() => router.push(
              a.providerType === "NURSE"
                ? `/patient/nurse?nurseId=${a.doctorId}${a.nurseServiceId ? `&serviceId=${a.nurseServiceId}` : ""}`
                : `/patient/book?doctorId=${a.doctorId}&followUpOf=${a.id}`
            )}
            className="btn-secondary py-2 px-3 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {a.providerType === "NURSE" ? "Book Again" : "Book Follow-up"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PatientAppointments() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  const PAGE_SIZE = 5;

  const unreadTotalRef = useRef<number | null>(null);
  const load = useCallback(() => {
    fetch("/api/appointments/me")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Appointment[]) => {
        setAppointments(d);
        setLoading(false);
        const total = d.reduce((sum, a) => sum + a.unreadMessageCount, 0);
        if (unreadTotalRef.current !== null && total > unreadTotalRef.current) playMessageChime();
        unreadTotalRef.current = total;
      })
      .catch(() => setLoading(false));
  }, []);

  // The 5s poll below keeps this fresh while the tab/app stays open, but
  // mobile WebViews commonly suspend timers while backgrounded — force an
  // immediate refetch on resume/reconnect instead of waiting for the next tick.
  useResync(load);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/patient/appointments");
    if (!authLoading && user && user.role !== "PATIENT") router.push("/login");
  }, [authLoading, user, router]);

  // Poll so status changes (e.g. the doctor accepting a request) show up
  // without the patient needing to refresh the page.
  useEffect(() => {
    if (user?.role !== "PATIENT") return;
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [user, load]);

  // Ticks the pending-request countdown independently of the 5s data poll.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const openCancelDialog = (a: Appointment) => {
    setCancelError("");
    setCancelTarget(a);
  };

  const openRescheduleDialog = (a: Appointment) => {
    setRescheduleError("");
    setNewScheduledAt("");
    setRescheduleTarget(a);
  };

  // Drops a pending new-time request; returns an error message, or null on success.
  const withdrawReschedule = async (a: Appointment): Promise<string | null> => {
    try {
      const res = await fetch(`/api/appointments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawReschedule: true }),
      });
      load();
      return res.ok ? null : (await res.json().catch(() => ({}))).error ?? "Couldn't withdraw the request.";
    } catch {
      return "Network error — please try again.";
    }
  };

  const confirmReschedule = async () => {
    if (!rescheduleTarget || !newScheduledAt) return;
    setRescheduling(true);
    setRescheduleError("");
    const res = await fetch(`/api/appointments/${rescheduleTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: new Date(newScheduledAt).toISOString() }),
    });
    setRescheduling(false);
    if (res.ok) {
      setRescheduleTarget(null);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setRescheduleError(data.error ?? "Couldn't reschedule this appointment. Please try again.");
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError("");
    const res = await fetch(`/api/appointments/${cancelTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    setCancelling(false);
    if (res.ok) {
      setCancelTarget(null);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setCancelError(data.error ?? "Couldn't cancel this appointment. Please try again.");
    }
  };

  if (authLoading || !user || user.role !== "PATIENT") {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>;
  }

  const pending = appointments
    .filter((a) => a.status === "PENDING_APPROVAL")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const upcoming = appointments
    .filter((a) => a.status === "SCHEDULED")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const past = appointments
    .filter((a) => !["PENDING_APPROVAL", "SCHEDULED"].includes(a.status))
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <PullToRefresh onRefresh={load} className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <CalendarClock className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">My Appointments</h1>
            <p className="text-slate-500 text-sm">Track requests, upcoming appointments, and past consultations.</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
          </div>
        ) : (
          <div className="space-y-8">
            {pending.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Pending Requests ({pending.length})
                </h2>
                <div className="space-y-3">
                  {(pendingExpanded ? pending : pending.slice(0, PAGE_SIZE)).map((a) => (
                    <AppointmentCard key={a.id} a={a} patientId={user.id} now={now} onCancel={openCancelDialog} onReschedule={openRescheduleDialog} onWithdrawReschedule={withdrawReschedule} onReview={setReviewFor} />
                  ))}
                </div>
                {!pendingExpanded && pending.length > PAGE_SIZE && (
                  <button onClick={() => setPendingExpanded(true)} className="w-full mt-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                    Load {pending.length - PAGE_SIZE} more
                  </button>
                )}
              </section>
            )}

            <section>
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <CalendarClock className="w-4 h-4" /> Upcoming ({upcoming.length})
              </h2>
              {upcoming.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm">
                  No upcoming appointments. <Link href="/patient/dashboard" className="text-blue-600 font-semibold">Book one now →</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {(upcomingExpanded ? upcoming : upcoming.slice(0, PAGE_SIZE)).map((a) => (
                    <AppointmentCard key={a.id} a={a} patientId={user.id} now={now} onCancel={openCancelDialog} onReschedule={openRescheduleDialog} onWithdrawReschedule={withdrawReschedule} onReview={setReviewFor} />
                  ))}
                </div>
              )}
              {!upcomingExpanded && upcoming.length > PAGE_SIZE && (
                <button onClick={() => setUpcomingExpanded(true)} className="w-full mt-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                  Load {upcoming.length - PAGE_SIZE} more
                </button>
              )}
            </section>

            <section>
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Past ({past.length})</h2>
              {past.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm">
                  No past appointments yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {(pastExpanded ? past : past.slice(0, PAGE_SIZE)).map((a) => (
                    <AppointmentCard key={a.id} a={a} patientId={user.id} now={now} onCancel={openCancelDialog} onReschedule={openRescheduleDialog} onWithdrawReschedule={withdrawReschedule} onReview={setReviewFor} />
                  ))}
                </div>
              )}
              {!pastExpanded && past.length > PAGE_SIZE && (
                <button onClick={() => setPastExpanded(true)} className="w-full mt-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                  Load {past.length - PAGE_SIZE} more
                </button>
              )}
            </section>
          </div>
        )}
      </PullToRefresh>

      {reviewFor && (
        <ReviewModal
          appointmentId={reviewFor}
          onClose={() => setReviewFor(null)}
          onSubmitted={() => { setReviewFor(null); load(); }}
        />
      )}

      {cancelTarget && (() => {
        const willRefund = cancelTarget.status === "SCHEDULED" && cancelTarget.paymentStatus === "PAID";
        const refundAmount = Math.max(0, cancelTarget.amount - cancelTarget.discountAmount);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
              <div className="flex items-center gap-2 mb-3">
                <ThumbsDown className="w-5 h-5 text-red-600" />
                <h3 className="font-bold text-slate-800">
                  {cancelTarget.status === "SCHEDULED" ? "Cancel this appointment?" : "Cancel this request?"}
                </h3>
              </div>
              <p className="text-sm text-slate-500 mb-2">
                Your {cancelTarget.status === "SCHEDULED" ? "appointment" : "request"} with {formatProviderName(cancelTarget.doctor.name, cancelTarget.providerType)} on {new Date(cancelTarget.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} will be cancelled. This cannot be undone.
              </p>
              {willRefund && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2">
                  ₹{refundAmount} will be credited back to your wallet.
                </p>
              )}
              {cancelError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
                  {cancelError}
                </p>
              )}
              <div className="flex gap-3 mt-3">
                <button onClick={() => { setCancelTarget(null); setCancelError(""); }} className="btn-secondary flex-1">
                  Keep {cancelTarget.status === "SCHEDULED" ? "Appointment" : "Request"}
                </button>
                <button onClick={confirmCancel} disabled={cancelling} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  {cancelling ? "Cancelling…" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {rescheduleTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-800">Reschedule appointment</h3>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              Pick a new time for your {rescheduleTarget.status === "SCHEDULED" ? "appointment" : "request"} with {formatProviderName(rescheduleTarget.doctor.name, rescheduleTarget.providerType)}.
            </p>
            {rescheduleTarget.status === "SCHEDULED" && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                {`${formatProviderName(rescheduleTarget.doctor.name, rescheduleTarget.providerType)} needs to confirm the new time. Until then your current booking (${new Date(rescheduleTarget.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}) stays as it is${rescheduleTarget.requestedScheduledAt ? ", and this replaces your earlier request" : ""}.`}
              </p>
            )}
            {rescheduleTarget.consultType === "CLINIC" && rescheduleTarget.clinicId ? (
              // Same slot grid as booking — the API only accepts these times.
              <div className="mb-3">
                <TimeSlotPicker
                  doctorId={rescheduleTarget.doctorId}
                  clinicId={rescheduleTarget.clinicId}
                  value={newScheduledAt}
                  onChange={setNewScheduledAt}
                />
              </div>
            ) : (
              <input
                type="datetime-local"
                required
                className="input-field mb-3"
                min={nowLocalInput()}
                value={newScheduledAt}
                onChange={(e) => setNewScheduledAt(e.target.value)}
              />
            )}
            {rescheduleError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
                {rescheduleError}
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setRescheduleTarget(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={confirmReschedule}
                disabled={rescheduling || !newScheduledAt}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {rescheduling ? "Saving…" : "Confirm New Time"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
