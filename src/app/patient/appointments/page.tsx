"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, CalendarClock, Stethoscope, Home, Building2, Video,
  FileText, Star, X, Wallet, CreditCard, Siren, RotateCcw, Clock,
  Pill, ThumbsDown, CreditCard as CardIcon, Car, MapPinCheck, MapPin,
  MessageCircle, Navigation, UserCheck,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn, formatDoctorName } from "@/lib/utils";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import PrescriptionDownloadButton from "@/components/patient/PrescriptionDownloadButton";
import { playMessageChime } from "@/lib/playNotificationSound";
import { VIDEO_UNLOCK_DELAY_SECONDS } from "@/lib/videoCall";

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
  status: string;
  consultType: string;
  symptoms: string;
  patientName: string | null;
  relation: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  paidAt: string | null;
  isEmergency: boolean;
  travelStatus: string;
  unreadMessageCount: number;
  attachments: Attachment[];
  doctorNotes: string | null;
  scheduledAt: string;
  createdAt: string;
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
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Waiting for doctor",
  SCHEDULED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Declined",
  EXPIRED: "Doctor was busy",
};

const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Seconds left before a paid video appointment's "Join Video Call" button
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

function AppointmentCard({ a, patientId, now, onCancel, onReview }: {
  a: Appointment;
  patientId: string;
  now: number;
  onCancel: (a: Appointment) => void;
  onReview: (id: string) => void;
}) {
  const Icon = TYPE_ICON[a.consultType] ?? Stethoscope;
  const router = useRouter();
  const needsPayment = a.status === "SCHEDULED" && a.paymentMethod === "ONLINE" && a.paymentStatus === "PENDING";
  const timeLeftMs = REQUEST_TIMEOUT_MS - (now - new Date(a.createdAt).getTime());

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              {formatDoctorName(a.doctor.name)}
              {a.isEmergency && (
                <span className="badge badge-danger"><Siren className="w-3 h-3" /> Emergency</span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{a.doctor.doctorProfile?.specialty ?? ""}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {new Date(a.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </div>
            {a.relation !== "Self" && a.patientName && (
              <div className="text-xs text-blue-600 font-medium mt-0.5">For {a.patientName} ({a.relation})</div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={STATUS_BADGE[a.status] ?? "badge badge-gray"}>{STATUS_LABEL[a.status] ?? a.status}</span>
          <span className="text-sm font-bold text-slate-800">₹{a.amount}</span>
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-3">{a.symptoms}</p>

      {a.status === "PENDING_APPROVAL" && a.reassignedFromId && a.reassignedFrom && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-3 flex items-center gap-2">
          <UserCheck className="w-4 h-4 flex-shrink-0" />
          {formatDoctorName(a.reassignedFrom.doctor.name)} had an emergency and couldn&apos;t continue with your appointment, so we&apos;ve assigned you to {formatDoctorName(a.doctor.name)} instead.
        </div>
      )}
      {a.status === "PENDING_APPROVAL" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-3 flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4 flex-shrink-0" /> Waiting for {formatDoctorName(a.doctor.name)} to accept this request.
          </span>
          <span className="text-xs font-mono font-semibold text-amber-700 flex-shrink-0">
            {timeLeftMs > 0 ? `${formatCountdown(timeLeftMs)} left` : "Expiring…"}
          </span>
        </div>
      )}
      {a.status === "CANCELLED" && a.reassignedTo && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-3 flex items-center gap-2">
          <UserCheck className="w-4 h-4 flex-shrink-0" />
          {formatDoctorName(a.doctor.name)} had an emergency and couldn&apos;t continue with this appointment, so we&apos;ve assigned you to {formatDoctorName(a.reassignedTo.doctor.name)} instead — check your pending requests.
        </div>
      )}
      {a.status === "REJECTED" && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 mb-3 flex items-center gap-2">
          <ThumbsDown className="w-4 h-4 flex-shrink-0 text-slate-400" /> {formatDoctorName(a.doctor.name)} was unable to accept this request. No payment was taken.
        </div>
      )}
      {a.status === "EXPIRED" && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 flex-shrink-0 text-slate-400" /> {formatDoctorName(a.doctor.name)}{" "}didn&apos;t respond in time and may be too busy right now. No payment was taken — try booking again or choose another doctor.
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
              {a.clinic?.name || a.doctor.doctorProfile?.clinicName || `${formatDoctorName(a.doctor.name)}'s clinic`}
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
            <Car className="w-4 h-4 flex-shrink-0" /> {formatDoctorName(a.doctor.name)} is on the way
          </span>
          <span className="font-semibold underline flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> Track Live
          </span>
        </Link>
      )}
      {a.status === "SCHEDULED" && a.consultType === "HOME" && a.travelStatus === "ARRIVED" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-3 flex items-center gap-2">
          <MapPinCheck className="w-4 h-4 flex-shrink-0" /> {formatDoctorName(a.doctor.name)} has arrived.
        </div>
      )}
      {needsPayment && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-3 flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <CardIcon className="w-4 h-4 flex-shrink-0" /> Payment pending — pay ₹{a.amount} to confirm your visit with {formatDoctorName(a.doctor.name)}.
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
          <span className="font-semibold text-slate-700">Doctor&apos;s notes: </span>{a.doctorNotes}
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

      <div className="flex gap-2 flex-wrap">
        {a.status === "PENDING_APPROVAL" && (
          <button onClick={() => onCancel(a)} className="btn-secondary py-2 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50">
            Cancel Request
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
        {(a.status === "SCHEDULED" || a.status === "COMPLETED") && (
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
              <Video className="w-3.5 h-3.5" /> Join Video Call
            </Link>
          )
        )}
        {a.status === "COMPLETED" && a.attachments.map((att, i) => (
          <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="btn-secondary py-2 px-3 text-xs">
            <FileText className="w-3.5 h-3.5" />
            {a.attachments.length > 1 ? `File ${i + 1}` : "View Attached File"}
          </a>
        ))}
        {a.status === "COMPLETED" && (a.medicines.length > 0 || !!a.doctorNotes) && (
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
            onClick={() => router.push(`/patient/book?doctorId=${a.doctorId}&followUpOf=${a.id}`)}
            className="btn-secondary py-2 px-3 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Book Follow-up
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
  const PAGE_SIZE = 5;

  const unreadTotalRef = useRef<number | null>(null);
  const load = useCallback(() => {
    fetch("/api/appointments/me")
      .then((r) => r.json())
      .then((d: Appointment[]) => {
        setAppointments(d);
        setLoading(false);
        const total = d.reduce((sum, a) => sum + a.unreadMessageCount, 0);
        if (unreadTotalRef.current !== null && total > unreadTotalRef.current) playMessageChime();
        unreadTotalRef.current = total;
      });
  }, []);

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
    load();
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
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900">My Appointments</h1>
          <p className="text-slate-500 text-sm">Track requests, upcoming visits, and past consultations.</p>
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
                    <AppointmentCard key={a.id} a={a} patientId={user.id} now={now} onCancel={setCancelTarget} onReview={setReviewFor} />
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
                    <AppointmentCard key={a.id} a={a} patientId={user.id} now={now} onCancel={setCancelTarget} onReview={setReviewFor} />
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
                    <AppointmentCard key={a.id} a={a} patientId={user.id} now={now} onCancel={setCancelTarget} onReview={setReviewFor} />
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
      </div>

      {reviewFor && (
        <ReviewModal
          appointmentId={reviewFor}
          onClose={() => setReviewFor(null)}
          onSubmitted={() => { setReviewFor(null); load(); }}
        />
      )}

      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <ThumbsDown className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-800">Cancel this request?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              Your request to {formatDoctorName(cancelTarget.doctor.name)} on {new Date(cancelTarget.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} will be cancelled. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setCancelTarget(null)} className="btn-secondary flex-1">
                Keep Request
              </button>
              <button onClick={confirmCancel} disabled={cancelling} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {cancelling ? "Cancelling…" : "Cancel Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
