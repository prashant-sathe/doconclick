"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, Clock, MapPin, Navigation, Phone, MessageCircle, FileText, CheckCircle2, XCircle,
  Car, Flag, AlertTriangle, IndianRupee, User as UserIcon, CalendarClock, Star,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { NurseHeader, NurseMobileNav } from "@/components/nurse/NurseNav";
import ConfirmDialog from "@/components/ConfirmDialog";
import { isNative, getCurrentPositionCompat } from "@/lib/platform";
import { startBackgroundLocationWatch, stopBackgroundLocationWatch } from "@/lib/backgroundLocation";
import { cn } from "@/lib/utils";

type Visit = {
  id: string;
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

function directionsUrl(v: Visit) {
  const p = v.patient.patientProfile;
  if (p?.lat != null && p?.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  if (p?.homeAddress) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.homeAddress)}`;
  return null;
}

export default function NurseDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [profileStatus, setProfileStatus] = useState<{ status: string; bookable: boolean } | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("requests");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [completeTarget, setCompleteTarget] = useState<Visit | null>(null);
  const [visitNotes, setVisitNotes] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Visit | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/nurse/dashboard");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/appointments/me");
    if (res.ok) setVisits(await res.json());
  }, []);

  useEffect(() => {
    if (!user || user.role !== "NURSE") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    fetch("/api/nurses/me").then(async (r) => {
      if (r.ok) { const d = await r.json(); setProfileStatus({ status: d.nurseProfile.status, bookable: d.bookable }); }
    });
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [user, load]);

  // ── Live journey tracking (same flow as the doctor dashboard) ──
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const sendPosition = (id: string, travelStatus: "ON_THE_WAY" | "ARRIVED", lat?: number, lng?: number) =>
    fetch(`/api/appointments/${id}/travel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ travelStatus, ...(lat != null && lng != null ? { lat, lng } : {}) }),
    });

  const startJourney = async (id: string) => {
    setBusyId(id); setError("");
    try {
      const pos = await getCurrentPositionCompat({ enableHighAccuracy: true });
      const res = await sendPosition(id, "ON_THE_WAY", pos.coords.latitude, pos.coords.longitude);
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not start the journey."); return; }
      lastSentRef.current = Date.now();
      const onMove = (lat: number, lng: number) => {
        const now = Date.now();
        if (now - lastSentRef.current < 10000) return; // ~1 update / 10s
        lastSentRef.current = now;
        sendPosition(id, "ON_THE_WAY", lat, lng);
      };
      if (isNative()) {
        await startBackgroundLocationWatch(onMove);
      } else if (navigator.geolocation) {
        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition((p) => onMove(p.coords.latitude, p.coords.longitude), () => {}, { enableHighAccuracy: true });
      }
    } catch {
      setError("Location access is needed to share your journey with the patient.");
    } finally {
      setBusyId(null);
      load();
    }
  };

  const markArrived = async (id: string) => {
    setBusyId(id); setError("");
    if (isNative()) await stopBackgroundLocationWatch().catch(() => {});
    else if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    const res = await sendPosition(id, "ARRIVED");
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not update.");
    setBusyId(null);
    load();
  };

  const setStatus = async (id: string, status: string, doctorNotes?: string) => {
    setBusyId(id); setError("");
    const res = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(doctorNotes !== undefined ? { doctorNotes } : {}) }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not update this visit.");
    setBusyId(null);
    load();
    return res.ok;
  };

  if (authLoading || !user || visits === null) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-rose-500" /></div>;
  }

  const requests = visits.filter((v) => v.status === "PENDING_APPROVAL");
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
              const p = v.patient.patientProfile;
              const dir = directionsUrl(v);
              const busy = busyId === v.id;
              const earning = Math.round((v.amount - v.platformFee) * 100) / 100;
              const paid = v.paymentStatus === "PAID";
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
                    <p className="text-sm font-semibold text-rose-700">{v.serviceName ?? "Nursing visit"}</p>
                    {v.symptoms && v.symptoms !== v.serviceName && <p className="text-xs text-rose-900/70 mt-0.5">{v.symptoms}</p>}
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                    <p className="flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-slate-400" />
                      {new Date(v.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    {p?.homeAddress && (
                      <p className="flex items-start gap-1.5"><MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span>{p.homeAddress}{p.landmark ? `, ${p.landmark}` : ""}{p.pinCode ? ` — ${p.pinCode}` : ""}</span>
                      </p>
                    )}
                    {v.allergies && <p className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="w-4 h-4" />Allergies: {v.allergies}</p>}
                    {v.prescriptionDoc && (
                      <a href={v.prescriptionDoc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-600 font-semibold hover:underline">
                        <FileText className="w-4 h-4" />Doctor&apos;s prescription: {v.prescriptionDoc.title}
                      </a>
                    )}
                  </div>

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
                          <button disabled={busy} onClick={() => startJourney(v.id)} className="btn-primary w-full justify-center py-2.5 text-sm">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />} Start journey
                          </button>
                        )}
                        {v.travelStatus === "ON_THE_WAY" && (
                          <button disabled={busy} onClick={() => markArrived(v.id)} className="btn-primary w-full justify-center py-2.5 text-sm">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />} I&apos;ve arrived
                          </button>
                        )}
                        {v.travelStatus === "ARRIVED" && (
                          <button
                            disabled={busy || !paid}
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
                      {v.review && <span className="text-xs text-amber-600 font-semibold flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{v.review.rating}/5</span>}
                    </div>
                  )}
                  {v.status === "COMPLETED" && v.doctorNotes && <p className="text-xs text-slate-500 mt-2">Notes: {v.doctorNotes}</p>}
                  {v.status === "PENDING_APPROVAL" && (
                    <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" />Requested {new Date(v.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
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
          onConfirm={async () => { await setStatus(cancelTarget.id, "CANCELLED"); setCancelTarget(null); }}
        />
      )}
    </div>
  );
}
