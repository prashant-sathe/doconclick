"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin, Video, Home, Building2, Loader2,
  CalendarClock, Clock, IndianRupee,
  CalendarCheck2, Hash, ClipboardList, AlertTriangle, ShieldCheck, Users, Search, X,
} from "lucide-react";
import { cn, formatDoctorName } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { estimateArrivalMinutes } from "@/lib/eta";
import { useSpecialties } from "@/lib/useSpecialties";
import { isClinicOpenNow, findOpenClinic, findNextOpening, formatSlotTime, formatClinicHours, type NextOpening } from "@/lib/clinicAvailability";
import { RELATIONS } from "@/lib/relations";
import { haversine } from "@/lib/geo";
import RatingStars from "@/components/patient/RatingStars";
import VerifiedBadge from "@/components/patient/VerifiedBadge";
import SpecialtyFilter from "@/components/patient/SpecialtyFilter";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import DependentPicker from "@/components/patient/DependentPicker";
import ConfirmDialog from "@/components/ConfirmDialog";

interface ClinicSlot {
  dayOfWeek: string;
  fromTime: string;
  toTime: string;
}

interface Clinic {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  sortOrder: number;
  slots: ClinicSlot[];
}

interface Doctor {
  id: string;
  name: string;
  clinics: Clinic[];
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
    radius: number;
    lat: number | null;
    lng: number | null;
  } | null;
}

function nowLocalInput() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

// A <input type="datetime-local"> value ("YYYY-MM-DDTHH:MM") for the start of an
// upcoming clinic opening — used to prefill the scheduler so the patient can
// only land on a time the clinic is actually open.
function nextOpeningLocalInput(opening: NextOpening<unknown>) {
  const d = new Date();
  d.setDate(d.getDate() + opening.daysAhead);
  const [h, m] = opening.fromTime.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function openingWhenLabel(opening: NextOpening<unknown>) {
  const day = opening.daysAhead === 0 ? "today" : opening.daysAhead === 1 ? "tomorrow" : opening.dayOfWeek;
  return `${day} at ${formatSlotTime(opening.fromTime)}`;
}

const ALL_TYPES = [
  { id: "CLINIC", label: "Clinic Visit", icon: Building2 },
  { id: "HOME",   label: "Home Visit",   icon: Home },
  { id: "VIDEO",  label: "Video Call",   icon: Video },
];

function defaultConsultType(doctor: Doctor | null | undefined, userPos: [number, number] | null = null): string {
  const profile = doctor?.doctorProfile;
  if (!profile) return "CLINIC";
  const clinics = doctor?.clinics ?? [];
  const hasOpenClinic = clinics.length === 0 || clinics.some((c) => isClinicOpenNow(c.slots));
  const homeBaseLat = profile.lat ?? clinics[0]?.lat ?? null;
  const homeBaseLng = profile.lng ?? clinics[0]?.lng ?? null;
  const distance =
    userPos && homeBaseLat != null && homeBaseLng != null
      ? haversine(userPos[0], userPos[1], homeBaseLat, homeBaseLng)
      : null;
  const hasHomeVisitReach = !(distance != null && profile.radius != null && distance > profile.radius);
  if (profile.offersClinic !== false && hasOpenClinic) return "CLINIC";
  if (profile.offersHomeVisit && hasHomeVisitReach) return "HOME";
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
  const preselectClinicId = searchParams.get("clinicId");

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [form, setForm] = useState({ doctorId: "", clinicId: "", symptoms: "", allergies: "", consultType: "CLINIC", relation: "Self" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [dependentId, setDependentId] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"NOW" | "LATER">("NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
        const clinicId = preselectClinicId && preselected.clinics.some((c) => c.id === preselectClinicId)
          ? preselectClinicId
          : (findOpenClinic(preselected.clinics) ?? preselected.clinics[0])?.id ?? "";
        setForm((f) => ({ ...f, doctorId: preselected.id, clinicId, consultType: defaultConsultType(preselected, userPos) }));
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
  const selectedClinic = selectedDoctor?.clinics.find((c) => c.id === form.clinicId) ?? null;
  const homeBaseLat = selectedDoctor?.doctorProfile?.lat ?? selectedDoctor?.clinics[0]?.lat ?? null;
  const homeBaseLng = selectedDoctor?.doctorProfile?.lng ?? selectedDoctor?.clinics[0]?.lng ?? null;
  const distance =
    userPos && homeBaseLat != null && homeBaseLng != null
      ? haversine(userPos[0], userPos[1], homeBaseLat, homeBaseLng)
      : null;
  const currentFee = feeForConsultType(selectedDoctor?.doctorProfile ?? null, form.consultType);

  // The moment the appointment would actually happen — used to check the
  // selected clinic's hours against, not just the current moment.
  const effectiveBookingTime =
    scheduleMode === "LATER" && scheduledAt ? new Date(scheduledAt) : new Date();

  // Home Visit is only offered within the doctor's stated consultation
  // radius — beyond that they simply can't travel there. Unknown distance
  // (no location yet) doesn't block it.
  const homeVisitRadiusKm = selectedDoctor?.doctorProfile?.radius ?? null;
  const hasHomeVisitReach = !(distance != null && homeVisitRadiusKm != null && distance > homeVisitRadiusKm);

  const availableTypes = ALL_TYPES.filter((t) => {
    if (t.id === "HOME") return selectedDoctor?.doctorProfile?.offersHomeVisit !== false && hasHomeVisitReach;
    // Clinic stays offered even when every clinic is closed right now — the
    // patient can still schedule the visit for an upcoming open slot.
    if (t.id === "CLINIC") return selectedDoctor?.doctorProfile?.offersClinic !== false;
    if (t.id === "VIDEO") return selectedDoctor ? selectedDoctor.doctorProfile?.offersVideo === true : true;
    return true;
  });

  // A Clinic Visit can only be confirmed once a specific clinic is selected
  // that is open at the effective booking time — i.e. "now" for an immediate
  // booking, or the chosen slot for a scheduled one. Doctors with no clinics
  // at all keep the legacy unrestricted behavior.
  const clinicBookingBlocked =
    form.consultType === "CLINIC" &&
    selectedDoctor != null &&
    selectedDoctor.clinics.length > 0 &&
    (!selectedClinic || !isClinicOpenNow(selectedClinic.slots, effectiveBookingTime));

  const homeVisitBlocked = form.consultType === "HOME" && !hasHomeVisitReach;

  // The "Confirm Booking" button only validates and opens the confirmation
  // dialog — the request itself is fired from confirmAndBook once the patient
  // says yes in the dialog.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) { router.push("/login"); return; }
    if (!consentGiven) { setError("Please agree to the consent statement to continue."); return; }
    if (form.relation !== "Self" && !dependentId) { setError("Please select or add the family member this visit is for."); return; }
    if (clinicBookingBlocked) {
      setError(
        scheduleMode === "LATER"
          ? "The clinic isn't open at the time you picked. Choose a time within the clinic's hours."
          : "This clinic is closed right now. Switch to Schedule Later and pick a time when it's open."
      );
      return;
    }
    if (scheduleMode === "LATER" && scheduledAt && new Date(scheduledAt).getTime() <= new Date().getTime()) {
      setError("Please pick a time in the future.");
      return;
    }
    setError("");
    setConfirmOpen(true);
  };

  const confirmAndBook = async () => {
    setLoading(true);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doctorId: form.doctorId,
        clinicId: form.consultType === "CLINIC" ? form.clinicId : undefined,
        symptoms: form.symptoms,
        allergies: form.allergies,
        consultType: form.consultType,
        dependentId,
        amount: currentFee,
        paymentMethod: "ONLINE",
        consentGiven,
        followUpOfId: followUpOfId ?? undefined,
        patientLat: userPos?.[0],
        patientLng: userPos?.[1],
        ...(scheduleMode === "LATER" && scheduledAt
          ? { scheduledAt: new Date(scheduledAt).toISOString() }
          : {}),
      }),
    });
    const data = await res.json();
    setLoading(false);
    setConfirmOpen(false);
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
                  <span className="font-semibold text-slate-800">{selectedDoctor && formatDoctorName(selectedDoctor.name)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Consultation</span>
                  <span className="font-semibold text-slate-800">{ALL_TYPES.find((t) => t.id === form.consultType)?.label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><CalendarCheck2 className="w-3.5 h-3.5" /> When</span>
                  <span className="font-semibold text-slate-800">{scheduleMode === "LATER" && scheduledAt ? new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Now"}</span>
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
                const clinicId = (findOpenClinic(doc?.clinics ?? []) ?? doc?.clinics[0])?.id ?? "";
                setForm((f) => ({ ...f, doctorId: e.target.value, clinicId, consultType: defaultConsultType(doc, userPos) }));
              }}>
                <option value="">— Choose a doctor —</option>
                {visibleDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatDoctorName(d.name)} — {d.doctorProfile?.specialty} (₹{feeForConsultType(d.doctorProfile, form.consultType)})
                  </option>
                ))}
              </select>
            </div>

            {selectedDoctor?.doctorProfile && (
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{formatDoctorName(selectedDoctor.name)}</span>
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

            {/* Home Visit distance gate */}
            {homeVisitBlocked && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 text-xs text-red-800">
                  <p className="font-semibold">
                    {selectedDoctor && formatDoctorName(selectedDoctor.name)} is {distance?.toFixed(1)} km away — too far for a home visit right now.
                  </p>
                  <p className="mt-0.5">They only offer home visits within {homeVisitRadiusKm} km. Try Clinic Visit or Video Call instead.</p>
                </div>
              </div>
            )}

            {/* Clinic location (only for Clinic Visit, when the doctor has clinics) */}
            {form.consultType === "CLINIC" && selectedDoctor && selectedDoctor.clinics.length > 0 && (
              <div>
                <label className="input-label">Choose Clinic</label>
                <select
                  required
                  className="input-field"
                  value={form.clinicId}
                  onChange={(e) => set("clinicId", e.target.value)}
                >
                  {selectedDoctor.clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {isClinicOpenNow(c.slots, effectiveBookingTime) ? "Open" : "Closed"} {scheduleMode === "LATER" ? "at that time" : "now"}
                    </option>
                  ))}
                </select>
                {selectedClinic && (
                  <p className="text-xs text-slate-500 mt-1.5">{selectedClinic.address}</p>
                )}

                {/* When this clinic is open — so the patient knows which times they can schedule */}
                {selectedClinic && (() => {
                  const hours = formatClinicHours(selectedClinic.slots);
                  if (hours.length === 0) return null;
                  return (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mb-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> Clinic hours
                      </p>
                      <ul className="space-y-0.5">
                        {hours.map((h) => (
                          <li key={h.dayOfWeek} className="text-xs text-slate-600 flex justify-between gap-3">
                            <span className="font-medium text-slate-500">{h.label}</span>
                            <span className="text-right">{h.ranges.join(", ")}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                {selectedClinic && !isClinicOpenNow(selectedClinic.slots, effectiveBookingTime) && (() => {
                  const openClinic = findOpenClinic(selectedDoctor.clinics.filter((c) => c.id !== selectedClinic.id), effectiveBookingTime);
                  const nextHere = findNextOpening([selectedClinic], new Date());
                  return (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 mt-2 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 text-xs text-red-800">
                        <p className="font-semibold">
                          Not available at this clinic {scheduleMode === "LATER" ? "at the selected time" : "right now"} — booking is disabled here.
                        </p>
                        {openClinic && (
                          <button
                            type="button"
                            onClick={() => set("clinicId", openClinic.id)}
                            className="underline font-bold mt-0.5 block"
                          >
                            {scheduleMode === "LATER" ? "Available at that time" : "Currently available"} at {openClinic.name} — switch &amp; book here instead
                          </button>
                        )}
                        {nextHere && (
                          <p className="mt-1.5 pt-1.5 border-t border-red-200">
                            Want an appointment at {selectedClinic.name}?{" "}
                            <button
                              type="button"
                              onClick={() => {
                                setScheduleMode("LATER");
                                setScheduledAt(nextOpeningLocalInput(nextHere));
                              }}
                              className="underline font-bold"
                            >
                              Schedule it for {openingWhenLabel(nextHere)}
                            </button>
                          </p>
                        )}
                        {!openClinic && !nextHere && (
                          <p className="mt-0.5">No clinic is available {scheduleMode === "LATER" ? "at the selected time" : "right now"} — please pick a different time or clinic.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Now vs Schedule later */}
            <div>
              <label className="input-label mb-2 block">When?</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setScheduleMode("NOW")}
                  className={cn("py-2.5 rounded-xl border text-xs font-semibold transition-all",
                    scheduleMode === "NOW" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                  Book Now
                </button>
                <button type="button" onClick={() => setScheduleMode("LATER")}
                  className={cn("py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                    scheduleMode === "LATER" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                  <CalendarClock className="w-3.5 h-3.5" /> Schedule Later
                </button>
              </div>
              {scheduleMode === "LATER" && (
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

            {/* Consent */}
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-4 py-3 cursor-pointer">
              <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-blue-500 flex-shrink-0" />
              <span className="text-xs text-slate-600 flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                I confirm the information above is accurate and I consent to this doctor accessing my medical profile and treating me for this consultation.
              </span>
            </label>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Submit lives here on mobile; the sticky summary card has its own on lg: */}
            <button type="submit" disabled={loading || !consentGiven || clinicBookingBlocked || homeVisitBlocked} className="btn-primary w-full justify-center py-3.5 text-base lg:hidden">
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
                    <span className="font-bold text-slate-900 text-sm truncate">{formatDoctorName(selectedDoctor.name)}</span>
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
                <span className="font-semibold text-slate-800">{scheduleMode === "LATER" ? "Scheduled" : "Now"}</span>
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

            <button type="submit" disabled={loading || !consentGiven || clinicBookingBlocked || homeVisitBlocked} className="btn-primary w-full justify-center py-3.5 text-base mt-5">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</> : "Confirm Booking"}
            </button>
          </div>
        </div>
        </form>
      </div>

      {confirmOpen && selectedDoctor && (
        <ConfirmDialog
          icon={CalendarCheck2}
          tone="primary"
          title="Confirm this booking?"
          confirmLabel={`Confirm (₹${currentFee})`}
          busyLabel="Booking…"
          cancelLabel="Go back"
          busy={loading}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmAndBook}
          message={
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <span>Doctor</span>
                <span className="font-semibold text-slate-700 text-right">{formatDoctorName(selectedDoctor.name)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Consultation</span>
                <span className="font-semibold text-slate-700 text-right">{typeLabel}</span>
              </div>
              {form.consultType === "CLINIC" && selectedClinic && (
                <div className="flex justify-between gap-3">
                  <span>Clinic</span>
                  <span className="font-semibold text-slate-700 text-right">{selectedClinic.name}</span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span>When</span>
                <span className="font-semibold text-slate-700 text-right">
                  {scheduleMode === "LATER" && scheduledAt
                    ? new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                    : "Now"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Payment</span>
                <span className="font-semibold text-slate-700 text-right">Online, after the doctor accepts</span>
              </div>
            </div>
          }
        />
      )}
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
