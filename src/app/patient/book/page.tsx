"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin, Video, Home, Building2, Loader2,
  CalendarClock, Siren, Clock, IndianRupee,
  CalendarCheck2, Hash, ClipboardList, AlertTriangle, ShieldCheck, Users, Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { estimateArrivalMinutes } from "@/lib/eta";
import { useSpecialties } from "@/lib/useSpecialties";
import { RELATIONS } from "@/lib/relations";
import { haversine } from "@/lib/geo";
import RatingStars from "@/components/patient/RatingStars";
import VerifiedBadge from "@/components/patient/VerifiedBadge";
import SpecialtyFilter from "@/components/patient/SpecialtyFilter";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import DependentPicker from "@/components/patient/DependentPicker";

interface Doctor {
  id: string;
  name: string;
  doctorProfile: {
    photoUrl: string | null;
    specialty: string;
    experience: number;
    consultFee: number;
    videoFee: number;
    homeVisitFee: number;
    availability: string;
    languages: string;
    bio: string | null;
    isVerified: boolean;
    offersHomeVisit: boolean;
    offersClinic: boolean;
    offersVideo: boolean;
    avgRating: number;
    totalReviews: number;
    lat: number | null;
    lng: number | null;
  } | null;
}

function nowLocalInput() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

const ALL_TYPES = [
  { id: "CLINIC", label: "Clinic Visit", icon: Building2 },
  { id: "HOME",   label: "Home Visit",   icon: Home },
  { id: "VIDEO",  label: "Video Call",   icon: Video },
];

function defaultConsultType(profile: Doctor["doctorProfile"]): string {
  if (!profile) return "CLINIC";
  if (profile.offersClinic !== false) return "CLINIC";
  if (profile.offersHomeVisit) return "HOME";
  if (profile.offersVideo) return "VIDEO";
  return "CLINIC";
}

function feeForConsultType(profile: Doctor["doctorProfile"], consultType: string): number {
  if (!profile) return 0;
  if (consultType === "HOME") return profile.homeVisitFee;
  if (consultType === "VIDEO") return profile.videoFee;
  return profile.consultFee;
}

function PatientBookInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { colorFor } = useSpecialties();
  const followUpOfId = searchParams.get("followUpOf");
  const preselectDoctorId = searchParams.get("doctorId");

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [form, setForm] = useState({ doctorId: "", symptoms: "", allergies: "", consultType: "CLINIC", relation: "Self" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [dependentId, setDependentId] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"NOW" | "LATER">("NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);
  const [fee, setFee] = useState(0);
  const [appointmentId, setAppointmentId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/doctors").then((r) => r.json()).then((data: Doctor[]) => {
      setDoctors(data);
      const preselected = preselectDoctorId && data.find((d) => d.id === preselectDoctorId);
      if (preselected) {
        setForm((f) => ({ ...f, doctorId: preselected.id, consultType: defaultConsultType(preselected.doctorProfile) }));
      }
    });
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => setUserPos(null),
      { timeout: 8000 }
    );
    fetch("/api/patients/me").then((r) => r.json()).then((d) => {
      const known = d.patientProfile?.allergies;
      if (known) set("allergies", known);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleDoctors = doctors.filter((d) => {
    const q = search.trim().toLowerCase();
    const matchesSpecialty = !specialtyFilter || d.doctorProfile?.specialty === specialtyFilter;
    const matchesSearch = !q || d.name.toLowerCase().includes(q) || (d.doctorProfile?.specialty ?? "").toLowerCase().includes(q);
    return matchesSpecialty && matchesSearch;
  });

  const selectedDoctor = doctors.find((d) => d.id === form.doctorId);
  const distance =
    userPos && selectedDoctor?.doctorProfile?.lat && selectedDoctor?.doctorProfile?.lng
      ? haversine(userPos[0], userPos[1], selectedDoctor.doctorProfile.lat, selectedDoctor.doctorProfile.lng)
      : null;
  const currentFee = feeForConsultType(selectedDoctor?.doctorProfile ?? null, form.consultType);
  const availableTypes = ALL_TYPES.filter((t) => {
    if (t.id === "HOME") return selectedDoctor?.doctorProfile?.offersHomeVisit !== false;
    if (t.id === "CLINIC") return selectedDoctor?.doctorProfile?.offersClinic !== false;
    if (t.id === "VIDEO") return selectedDoctor ? selectedDoctor.doctorProfile?.offersVideo === true : true;
    return true;
  });

  // An emergency always books immediately, overriding any manual schedule selection
  const effectiveScheduleMode = isEmergency ? "NOW" : scheduleMode;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) { router.push("/login"); return; }
    if (!isEmergency && !consentGiven) { setError("Please agree to the consent statement to continue."); return; }
    if (form.relation !== "Self" && !dependentId) { setError("Please select or add the family member this visit is for."); return; }
    setError("");
    setLoading(true);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doctorId: form.doctorId,
        symptoms: form.symptoms,
        allergies: form.allergies,
        consultType: form.consultType,
        dependentId,
        amount: currentFee,
        paymentMethod: "ONLINE",
        isEmergency,
        consentGiven,
        followUpOfId: followUpOfId ?? undefined,
        ...(effectiveScheduleMode === "LATER" && scheduledAt
          ? { scheduledAt: new Date(scheduledAt).toISOString() }
          : {}),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) { setFee(currentFee); setAppointmentId(data.id); setBooked(true); }
    else setError(data.error ?? "Booking failed. Please try again.");
  };

  if (authLoading) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>;
  }

  if (booked) {
    return (
      <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
        <PatientHeader />
        <PatientMobileNav />
        <div className="flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden lg:grid lg:grid-cols-2">
            {/* Success message */}
            <div className="p-10 text-center lg:text-left flex flex-col lg:justify-center">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto lg:mx-0 mb-5">
                <Clock className="w-9 h-9 text-amber-500" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Request Sent!</h2>
              <p className="text-slate-500 mb-6">Waiting for the doctor to confirm your appointment.</p>
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-3">
                You&apos;ll be notified once accepted — pay online from My Appointments after that.
              </div>
              <Link href="/patient/appointments" className="btn-secondary w-full justify-center py-3 mt-3">View My Appointments</Link>
            </div>

            {/* Appointment details summary */}
            <div className="bg-slate-50 p-8 border-t lg:border-t-0 lg:border-l border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" /> Appointment Details
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> ID</span>
                  <span className="font-mono text-slate-700 text-xs">{appointmentId.slice(0, 14)}…</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Doctor</span>
                  <span className="font-semibold text-slate-800">{selectedDoctor?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Consultation</span>
                  <span className="font-semibold text-slate-800">{ALL_TYPES.find((t) => t.id === form.consultType)?.label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><CalendarCheck2 className="w-3.5 h-3.5" /> When</span>
                  <span className="font-semibold text-slate-800">{effectiveScheduleMode === "LATER" && scheduledAt ? new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Now"}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <span className="text-slate-500 flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5" /> Total</span>
                  <span className="font-extrabold text-slate-900 text-base">₹{fee}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const typeLabel = ALL_TYPES.find((t) => t.id === form.consultType)?.label;

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <PatientHeader />
      <PatientMobileNav />

      <div className="max-w-5xl mx-auto p-6">
        <div className="text-center mb-6 lg:mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <MapPin className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Book Consultation</h1>
          <p className="text-slate-500 mt-2">Choose your doctor and consultation type.</p>
        </div>

        <form onSubmit={submit} className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:items-start lg:min-w-0">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 max-w-lg mx-auto lg:max-w-none lg:mx-0 lg:min-w-0">
          <div className="space-y-5">
            {/* Search + specialty filter */}
            <div>
              <label className="input-label mb-2 block">Find a Doctor</label>
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search doctor or specialty…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); set("doctorId", ""); }}
                  className="input-field pl-10 pr-10"
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
              <SpecialtyFilter value={specialtyFilter} onChange={(s) => { setSpecialtyFilter(s); set("doctorId", ""); }} />
            </div>

            {/* Consult Type */}
            <div>
              <label className="input-label mb-2 block">Consultation Type</label>
              <div className={cn("grid gap-3", availableTypes.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                {availableTypes.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => set("consultType", id)}
                    className={cn("relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-semibold transition-all",
                      form.consultType === id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}>
                    <Icon className="w-5 h-5" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Doctor Select */}
            <div>
              <label className="input-label">Select Doctor</label>
              <select required className="input-field" value={form.doctorId} onChange={(e) => {
                const doc = doctors.find((d) => d.id === e.target.value);
                setForm((f) => ({ ...f, doctorId: e.target.value, consultType: defaultConsultType(doc?.doctorProfile ?? null) }));
              }}>
                <option value="">— Choose a doctor —</option>
                {visibleDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.doctorProfile?.specialty} (₹{feeForConsultType(d.doctorProfile, form.consultType)})
                  </option>
                ))}
              </select>
            </div>

            {selectedDoctor?.doctorProfile && (
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{selectedDoctor.name}</span>
                  {selectedDoctor.doctorProfile.isVerified && <VerifiedBadge />}
                </div>
                <div className="text-xs mt-0.5">{selectedDoctor.doctorProfile.specialty} · {selectedDoctor.doctorProfile.experience} yrs · {selectedDoctor.doctorProfile.availability}</div>
                <div className="text-xs mt-0.5">Speaks: {selectedDoctor.doctorProfile.languages}</div>
                {selectedDoctor.doctorProfile.bio && (
                  <div className="text-xs mt-1 text-blue-700/80 line-clamp-2">{selectedDoctor.doctorProfile.bio}</div>
                )}
                <div className="mt-1.5">
                  <RatingStars avgRating={selectedDoctor.doctorProfile.avgRating} totalReviews={selectedDoctor.doctorProfile.totalReviews} />
                </div>
                <div className="text-xs mt-1.5 font-bold">Fee: ₹{currentFee}</div>
                {form.consultType === "HOME" && distance != null && (
                  <div className="text-xs mt-1 flex items-center gap-1 text-blue-600 font-semibold">
                    <Clock className="w-3.5 h-3.5" /> Arrives in ~{estimateArrivalMinutes(distance)} min ({distance.toFixed(1)} km)
                  </div>
                )}
              </div>
            )}

            {/* Now vs Schedule later */}
            <div>
              <label className="input-label mb-2 block">When?</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={isEmergency} onClick={() => setScheduleMode("NOW")}
                  className={cn("py-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-50",
                    effectiveScheduleMode === "NOW" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                  Book Now
                </button>
                <button type="button" disabled={isEmergency} onClick={() => setScheduleMode("LATER")}
                  className={cn("py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50",
                    effectiveScheduleMode === "LATER" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                  <CalendarClock className="w-3.5 h-3.5" /> Schedule Later
                </button>
              </div>
              {effectiveScheduleMode === "LATER" && (
                <input type="datetime-local" required className="input-field mt-3" min={nowLocalInput()}
                  value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              )}
            </div>

            <div>
              <label className="input-label"><Users className="inline w-3.5 h-3.5 mr-1" />Who is this for?</label>
              <div className="grid grid-cols-4 gap-2">
                {RELATIONS.map((r) => (
                  <button key={r} type="button" onClick={() => { set("relation", r); setDependentId(null); }}
                    className={cn("py-2 rounded-xl border text-xs font-semibold transition-all",
                      form.relation === r ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}>
                    {r}
                  </button>
                ))}
              </div>
              {form.relation !== "Self" && (
                <div className="mt-3">
                  <DependentPicker key={form.relation} relation={form.relation} selectedId={dependentId} onSelect={setDependentId} />
                </div>
              )}
            </div>

            <div>
              <label className="input-label">Symptoms / Reason</label>
              <textarea required rows={3} className="input-field resize-none"
                placeholder="Describe your symptoms briefly…"
                value={form.symptoms} onChange={(e) => set("symptoms", e.target.value)} />
            </div>

            <div>
              <label className="input-label"><AlertTriangle className="inline w-3.5 h-3.5 mr-1 text-amber-500" />Any Known Allergies?</label>
              <textarea rows={2} className="input-field resize-none"
                placeholder="e.g. Penicillin, Sulfa drugs — leave blank if none"
                value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
            </div>

            {/* Emergency toggle */}
            <label className="flex items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 cursor-pointer">
              <input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)}
                className="w-4 h-4 accent-red-500" />
              <Siren className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-red-700">This is an emergency (books now, pay online after)</span>
            </label>

            {/* Consent */}
            {!isEmergency && (
              <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-4 py-3 cursor-pointer">
                <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-blue-500 flex-shrink-0" />
                <span className="text-xs text-slate-600 flex items-start gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                  I confirm the information above is accurate and I consent to this doctor accessing my medical profile and treating me for this consultation.
                </span>
              </label>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Submit lives here on mobile; the sticky summary card has its own on lg: */}
            <button type="submit" disabled={loading || (!isEmergency && !consentGiven)} className="btn-primary w-full justify-center py-3.5 text-base lg:hidden">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</> : `Confirm Booking (₹${currentFee})`}
            </button>
          </div>
        </div>

        {/* Sticky booking summary (desktop only) */}
        <div className="hidden lg:block lg:sticky lg:top-24 mt-6 lg:mt-0">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Booking Summary</h3>

            {selectedDoctor?.doctorProfile ? (
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                {selectedDoctor.doctorProfile.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedDoctor.doctorProfile.photoUrl}
                    alt={selectedDoctor.name}
                    className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-extrabold"
                    style={{ background: `linear-gradient(135deg, ${colorFor(selectedDoctor.doctorProfile.specialty)}, ${colorFor(selectedDoctor.doctorProfile.specialty)}99)` }}
                  >
                    {selectedDoctor.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm truncate">{selectedDoctor.name}</span>
                    {selectedDoctor.doctorProfile.isVerified && <VerifiedBadge />}
                  </div>
                  <p className="text-xs text-slate-500">{selectedDoctor.doctorProfile.specialty}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 mb-4 pb-4 border-b border-slate-100">Select a doctor to see your booking summary.</p>
            )}

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Consultation</span>
                <span className="font-semibold text-slate-800">{typeLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5"><CalendarCheck2 className="w-3.5 h-3.5" /> When</span>
                <span className="font-semibold text-slate-800">{effectiveScheduleMode === "LATER" ? "Scheduled" : "Now"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Payment</span>
                <span className="font-semibold text-slate-800">Online</span>
              </div>
              {form.consultType === "HOME" && distance != null && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Arrival</span>
                  <span className="font-semibold text-slate-800">~{estimateArrivalMinutes(distance)} min</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-slate-500 flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5" /> Total</span>
                <span className="font-extrabold text-slate-900 text-lg">₹{currentFee}</span>
              </div>
            </div>

            <button type="submit" disabled={loading || (!isEmergency && !consentGiven)} className="btn-primary w-full justify-center py-3.5 text-base mt-5">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</> : "Confirm Booking"}
            </button>
          </div>
        </div>
        </form>
      </div>
    </div>
  );
}

export default function PatientBook() {
  return (
    <Suspense fallback={
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    }>
      <PatientBookInner />
    </Suspense>
  );
}
