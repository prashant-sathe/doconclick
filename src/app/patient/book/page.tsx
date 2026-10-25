"use client";
import { formatAvailability } from "@/lib/availability";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  MapPin, Video, Home, Building2, Loader2,
  CalendarClock, Clock, IndianRupee,
  CalendarCheck2, Hash, ClipboardList, AlertTriangle, ShieldCheck, Users, Search, X, Compass,
} from "lucide-react";
import { cn, formatDoctorName } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { estimateArrivalMinutes } from "@/lib/eta";
import { useSpecialties } from "@/lib/useSpecialties";
import { isClinicOpenNow, findOpenClinic, findNextOpening, formatSlotTime, formatClinicHours, type NextOpening } from "@/lib/clinicAvailability";
import ProviderAwayNotice, { type ProviderAvailability } from "@/components/patient/ProviderAwayNotice";
import { RELATIONS } from "@/lib/relations";
import { haversine, withinSearchRadius } from "@/lib/geo";
import { getCurrentPositionCompat } from "@/lib/platform";
import { readPatientLocation } from "@/lib/patientLocation";
import RatingStars from "@/components/patient/RatingStars";
import VerifiedBadge from "@/components/patient/VerifiedBadge";
import SpecialtyFilter from "@/components/patient/SpecialtyFilter";
import DoctorFilters from "@/components/patient/DoctorFilters";
import {
  type DoctorFilterState,
  DEFAULT_DOCTOR_FILTERS,
  matchesDoctorFilters,
  sortDoctors,
  readStoredDoctorFilters,
  writeStoredDoctorFilters,
} from "@/lib/doctorFilters";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import DependentPicker from "@/components/patient/DependentPicker";
import TimeSlotPicker from "@/components/patient/TimeSlotPicker";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useBookingProfileGate } from "@/components/patient/CompleteProfileSheet";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

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

interface Doctor extends ProviderAvailability {
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

const ALL_TYPES = [
  { id: "CLINIC", icon: Building2 },
  { id: "HOME",   icon: Home },
  { id: "VIDEO",  icon: Video },
] as const;

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
  const { user, loading: authLoading, requireTerms } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { colorFor } = useSpecialties();
  const followUpOfId = searchParams.get("followUpOf");
  const preselectDoctorId = searchParams.get("doctorId");
  const preselectClinicId = searchParams.get("clinicId");
  // "Book follow-up" passes the original visit's consult type too.
  const preselectConsultType = searchParams.get("consultType");
  const t = useTranslations("booking.book");
  const tf = useTranslations("booking.form");
  const tc = useTranslations("booking.common");
  const locale = formattingLocale(useLocale());
  const typeName = (id: string) => tc(`consultType.${id === "HOME" || id === "VIDEO" ? id : "CLINIC"}`);
  const dayName = (d: string) =>
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(d) ? tc(`days.${d as "Mon"}`) : d;
  const openingWhenLabel = (opening: NextOpening<unknown>) => {
    const time = formatSlotTime(opening.fromTime);
    if (opening.daysAhead === 0) return tf("openingToday", { time });
    if (opening.daysAhead === 1) return tf("openingTomorrow", { time });
    return tf("openingOn", { day: dayName(opening.dayOfWeek), time });
  };

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [doctorFilterState, setDoctorFilterState] = useState<DoctorFilterState>(DEFAULT_DOCTOR_FILTERS);
  useEffect(() => {
    const stored = readStoredDoctorFilters();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDoctorFilterState(stored);
    }
  }, []);
  const applyDoctorFilters = (next: DoctorFilterState) => {
    setDoctorFilterState(next);
    writeStoredDoctorFilters(next);
  };
  const [search, setSearch] = useState("");
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  // Patient's "doctor search range" preference (km); null = no limit.
  const [searchRadiusKm, setSearchRadiusKm] = useState<number | null>(null);
  const [radiusOverride, setRadiusOverride] = useState(false);
  const [pinnedLocationLabel, setPinnedLocationLabel] = useState<string | null>(null);
  const [form, setForm] = useState({ doctorId: "", clinicId: "", symptoms: "", allergies: "", consultType: "CLINIC", relation: "Self" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [dependentId, setDependentId] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"NOW" | "LATER">("NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const profileGate = useBookingProfileGate();
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);
  const [fee, setFee] = useState(0);
  const [appointmentId, setAppointmentId] = useState("");
  const [error, setError] = useState("");

  // Point the form at a doctor: pick an open clinic (else the first), the best
  // consult type, and — when that clinic is closed right now — pre-arm "Schedule
  // Later" with its next opening so the patient never lands on a disabled Confirm.
  const selectDoctor = (doc: Doctor | null | undefined, preferredClinicId?: string, preferredConsultType?: string) => {
    if (!doc) { setForm((f) => ({ ...f, doctorId: "", clinicId: "" })); return; }
    const clinicId = (preferredClinicId && doc.clinics.some((c) => c.id === preferredClinicId) ? preferredClinicId : null)
      ?? (findOpenClinic(doc.clinics) ?? doc.clinics[0])?.id
      ?? "";
    const profile = doc.doctorProfile;
    const offered =
      preferredConsultType === "CLINIC" ? profile?.offersClinic !== false
        : preferredConsultType === "HOME" ? !!profile?.offersHomeVisit
          : preferredConsultType === "VIDEO" ? !!profile?.offersVideo
            : false;
    const consultType = offered ? preferredConsultType! : defaultConsultType(doc, userPos);
    setForm((f) => ({ ...f, doctorId: doc.id, clinicId, consultType }));

    const chosenClinic = doc.clinics.find((c) => c.id === clinicId);
    if (consultType === "CLINIC" && chosenClinic && !isClinicOpenNow(chosenClinic.slots)) {
      const next = findNextOpening([chosenClinic], new Date());
      if (next) {
        setScheduleMode("LATER");
        setScheduledAt(nextOpeningLocalInput(next));
      }
    } else {
      setScheduleMode("NOW");
      setScheduledAt("");
    }
  };

  useEffect(() => {
    fetch("/api/doctors").then((r) => (r.ok ? r.json() : [])).then((data: Doctor[]) => {
      setDoctors(data);
      const preselected = preselectDoctorId && data.find((d) => d.id === preselectDoctorId);
      if (preselected) selectDoctor(preselected, preselectClinicId ?? undefined, preselectConsultType ?? undefined);
    }).catch(() => {});
    // A location the patient pinned on the map (e.g. for a relative in another
    // city) takes precedence over this device's GPS.
    const pinned = readPatientLocation();
    if (pinned) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserPos([pinned.lat, pinned.lng]);
      setPinnedLocationLabel(pinned.label);
    } else {
      getCurrentPositionCompat({ timeout: 8000 })
        .then((pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]))
        .catch(() => setUserPos(null));
    }
    fetch("/api/patients/me").then((r) => r.json()).then((d) => {
      const known = d.patientProfile?.allergies;
      if (known) set("allergies", known);
      setSearchRadiusKm(d.patientProfile?.searchRadiusKm ?? null);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Distance (km) of a doctor from the patient's current location, or null.
  const doctorDistance = (d: Doctor): number | null => {
    const lat = d.doctorProfile?.lat ?? d.clinics[0]?.lat ?? null;
    const lng = d.doctorProfile?.lng ?? d.clinics[0]?.lng ?? null;
    return userPos && lat != null && lng != null ? haversine(userPos[0], userPos[1], lat, lng) : null;
  };

  const visibleDoctors = sortDoctors(
    doctors
      .filter((d) => {
        const q = search.trim().toLowerCase();
        const matchesSpecialty = !specialtyFilter || d.doctorProfile?.specialty === specialtyFilter;
        const matchesSearch = !q || d.name.toLowerCase().includes(q) || (d.doctorProfile?.specialty ?? "").toLowerCase().includes(q);
        const matchesFilters = !d.doctorProfile || matchesDoctorFilters(d.doctorProfile, doctorFilterState);
        const inRange =
          radiusOverride ||
          d.id === preselectDoctorId ||
          withinSearchRadius(doctorDistance(d), searchRadiusKm, d.doctorProfile?.offersVideo ?? false);
        return matchesSpecialty && matchesSearch && matchesFilters && inRange;
      })
      .map((d) => ({ ...d, distance: doctorDistance(d) ?? undefined })),
    doctorFilterState.sortBy
  );

  const selectedDoctor = doctors.find((d) => d.id === form.doctorId);
  // Away right now (time off / offline): only a later day can be booked.
  useEffect(() => {
    // Moving the form off "Book Now" once the doctor's state is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedDoctor?.awayNow && scheduleMode === "NOW") setScheduleMode("LATER");
  }, [selectedDoctor?.awayNow, scheduleMode]);
  const selectedOutOfRange =
    !!selectedDoctor &&
    !radiusOverride &&
    !withinSearchRadius(doctorDistance(selectedDoctor), searchRadiusKm, selectedDoctor.doctorProfile?.offersVideo ?? false);
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
    if (!consentGiven) { setError(tf("errorConsent")); return; }
    if (form.relation !== "Self" && !dependentId) { setError(tf("errorDependent")); return; }
    if (clinicBookingBlocked) {
      setError(
        scheduleMode === "LATER"
          ? tf("errorClinicClosedLater")
          : tf("errorClinicClosedNow")
      );
      return;
    }
    if (scheduleMode === "LATER" && scheduledAt && new Date(scheduledAt).getTime() <= new Date().getTime()) {
      setError(tf("errorFutureTime"));
      return;
    }
    setError("");
    // First booking after quick signup: collect name/DOB/gender, then go on
    // to the confirmation dialog.
    profileGate.run(!!dependentId, () => setConfirmOpen(true));
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
    else if (data.code === "TERMS_REQUIRED") requireTerms(() => setConfirmOpen(true));
    else if (data.code === "PROFILE_INCOMPLETE") profileGate.open(data.missing, () => setConfirmOpen(true));
    else setError(data.error ?? tf("errorBookingFailed"));
  };

  if (authLoading) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>;
  }

  if (booked) {
    return (
      <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
        <PatientHeader />
        <PatientMobileNav />
        <div className="flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden lg:grid lg:grid-cols-2">
            {/* Success message */}
            <div className="p-10 text-center lg:text-left flex flex-col lg:justify-center">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto lg:mx-0 mb-5">
                <Clock className="w-9 h-9 text-amber-500" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-2">{tf("requestSent")}</h2>
              <p className="text-slate-500 mb-6">{t("waitingDoctor")}</p>
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-3">
                {fee === 0 ? tf("freeNotice") : tf("payLaterNotice")}
              </div>
              <Link href="/patient/appointments" className="btn-secondary w-full justify-center py-3 mt-3">{tc("viewMyAppointments")}</Link>
            </div>

            {/* Appointment details summary */}
            <div className="bg-slate-50 p-8 border-t lg:border-t-0 lg:border-l border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" /> {t("appointmentDetails")}
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> {tc("id")}</span>
                  <span className="font-mono text-slate-700 text-xs">{appointmentId.slice(0, 14)}…</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{tc("doctor")}</span>
                  <span className="font-semibold text-slate-800">{selectedDoctor && formatDoctorName(selectedDoctor.name)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{tc("consultation")}</span>
                  <span className="font-semibold text-slate-800">{typeName(form.consultType)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><CalendarCheck2 className="w-3.5 h-3.5" /> {tc("when")}</span>
                  <span className="font-semibold text-slate-800">{scheduleMode === "LATER" && scheduledAt ? new Date(scheduledAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : tc("now")}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <span className="text-slate-500 flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5" /> {tc("total")}</span>
                  <span className="font-extrabold text-slate-900 text-base">₹{fee}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const typeLabel = typeName(form.consultType);

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />

      <div className="max-w-5xl mx-auto p-6">
        <div className="text-center mb-6 lg:mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <MapPin className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 mt-2">{t("subtitle")}</p>
        </div>

        {pinnedLocationLabel && (
          <div className="max-w-lg mx-auto lg:max-w-none mb-4 flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-2.5">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 min-w-0">{t.rich("showingNear", { label: pinnedLocationLabel, b: (chunks) => <span className="font-semibold">{chunks}</span> })}</span>
            <Link href="/patient/dashboard" className="font-semibold flex-shrink-0 underline">{t("change")}</Link>
          </div>
        )}

        {selectedOutOfRange && selectedDoctor && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 max-w-lg mx-auto text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <Compass className="w-7 h-7 text-amber-500" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-1.5">{t("outOfRangeTitle")}</h2>
            <p className="text-sm text-slate-500 mb-6">
              {(() => {
                const d = doctorDistance(selectedDoctor);
                const doctor = formatDoctorName(selectedDoctor.name);
                return d != null
                  ? t("outOfRangeKm", { doctor, km: d.toFixed(0), range: searchRadiusKm ?? 0 })
                  : t("outOfRangeUnknown", { doctor, range: searchRadiusKm ?? 0 });
              })()}
            </p>
            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={() => setRadiusOverride(true)} className="btn-primary w-full justify-center py-3">
                {t("bookAnyway")}
              </button>
              <Link href="/patient/profile" className="btn-secondary w-full justify-center py-3">
                {t("changeRange")}
              </Link>
              <Link href="/patient/dashboard" className="text-sm font-semibold text-blue-600 hover:underline py-1">
                {t("findNearMe")}
              </Link>
            </div>
          </div>
        )}

        {!selectedOutOfRange && (
        <form onSubmit={submit} className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:items-start lg:min-w-0">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 max-w-lg mx-auto lg:max-w-none lg:mx-0 lg:min-w-0">
          <div className="space-y-5">
            {/* Search + specialty filter */}
            <div>
              <label className="input-label mb-2 block">{t("findDoctor")}</label>
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={t("searchPlaceholder")}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); set("doctorId", ""); }}
                  className="input-field pl-10 pr-10"
                />
                {search && (
                  <button aria-label={t("clearSearch")}
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SpecialtyFilter value={specialtyFilter} onChange={(s) => { setSpecialtyFilter(s); set("doctorId", ""); }} />
                </div>
                <DoctorFilters value={doctorFilterState} onChange={applyDoctorFilters} doctors={doctors} />
              </div>
            </div>

            {/* Consult Type */}
            <div>
              <label className="input-label mb-2 block">{t("consultTypeLabel")}</label>
              <div className={cn("grid gap-3", availableTypes.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                {availableTypes.map(({ id, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => set("consultType", id)}
                    className={cn("relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-semibold transition-all",
                      form.consultType === id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}>
                    <Icon className="w-5 h-5" /> {typeName(id)}
                  </button>
                ))}
              </div>
            </div>

            {/* Doctor Select */}
            <div>
              <label className="input-label">{t("selectDoctor")}</label>
              <select required className="input-field" value={form.doctorId} onChange={(e) => {
                selectDoctor(doctors.find((d) => d.id === e.target.value));
              }}>
                <option value="">{t("chooseDoctor")}</option>
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
                <div className="text-xs mt-0.5">{selectedDoctor.doctorProfile.specialty} · {t("experience", { years: selectedDoctor.doctorProfile.experience })} · {formatAvailability(selectedDoctor.doctorProfile.availability)}</div>
                <div className="text-xs mt-0.5">{t("speaks", { languages: selectedDoctor.doctorProfile.languages })}</div>
                {selectedDoctor.doctorProfile.bio && (
                  <div className="text-xs mt-1 text-blue-700/80 line-clamp-2">{selectedDoctor.doctorProfile.bio}</div>
                )}
                <div className="mt-1.5">
                  <RatingStars avgRating={selectedDoctor.doctorProfile.avgRating} totalReviews={selectedDoctor.doctorProfile.totalReviews} />
                </div>
                <div className="text-xs mt-1.5 font-bold">{t("fee", { fee: currentFee })}</div>
                {form.consultType === "HOME" && distance != null && (
                  <div className="text-xs mt-1 flex items-center gap-1 text-blue-600 font-semibold">
                    <Clock className="w-3.5 h-3.5" /> {t("arrivesInKm", { min: estimateArrivalMinutes(distance), km: distance.toFixed(1) })}
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
                    {selectedDoctor && tf("homeTooFar", { doctor: formatDoctorName(selectedDoctor.name), km: distance?.toFixed(1) ?? "" })}
                  </p>
                  <p className="mt-0.5">{tf("homeRadius", { radius: homeVisitRadiusKm ?? 0 })}</p>
                </div>
              </div>
            )}

            {/* Clinic location (only for Clinic Visit, when the doctor has clinics) */}
            {form.consultType === "CLINIC" && selectedDoctor && selectedDoctor.clinics.length > 0 && (
              <div>
                <label className="input-label">{tf("chooseClinic")}</label>
                <select
                  required
                  className="input-field"
                  value={form.clinicId}
                  onChange={(e) => set("clinicId", e.target.value)}
                >
                  {selectedDoctor.clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {isClinicOpenNow(c.slots, effectiveBookingTime)
                        ? tf(scheduleMode === "LATER" ? "clinicOpenThen" : "clinicOpenNow", { name: c.name })
                        : tf(scheduleMode === "LATER" ? "clinicClosedThen" : "clinicClosedNow", { name: c.name })}
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
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> {tf("clinicHours")}
                      </p>
                      <ul className="space-y-0.5">
                        {hours.map((h) => (
                          <li key={h.dayOfWeek} className="text-xs text-slate-600 flex justify-between gap-3">
                            <span className="font-medium text-slate-500">{dayName(h.dayOfWeek)}</span>
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
                          {tf(scheduleMode === "LATER" ? "notAvailableHereLater" : "notAvailableHereNow")}
                        </p>
                        {openClinic && (
                          <button
                            type="button"
                            onClick={() => set("clinicId", openClinic.id)}
                            className="underline font-bold mt-0.5 block"
                          >
                            {t(scheduleMode === "LATER" ? "switchClinicLater" : "switchClinicNow", { clinic: openClinic.name })}
                          </button>
                        )}
                        {nextHere && (
                          <p className="mt-1.5 pt-1.5 border-t border-red-200">
                            {tf("wantAppointmentAt", { clinic: selectedClinic.name })}{" "}
                            <button
                              type="button"
                              onClick={() => {
                                setScheduleMode("LATER");
                                setScheduledAt(nextOpeningLocalInput(nextHere));
                              }}
                              className="underline font-bold"
                            >
                              {tf("scheduleItFor", { when: openingWhenLabel(nextHere) })}
                            </button>
                          </p>
                        )}
                        {!openClinic && !nextHere && (
                          <p className="mt-0.5">{tf(scheduleMode === "LATER" ? "noClinicLater" : "noClinicNow")}</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Now vs Schedule later */}
            <div>
              <label className="input-label mb-2 block">{tf("when")}</label>
              <ProviderAwayNotice provider={selectedDoctor} />
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setScheduleMode("NOW")} disabled={!!selectedDoctor?.awayNow}
                  className={cn("min-h-11 py-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                    scheduleMode === "NOW" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                  {tf("bookNow")}
                </button>
                <button type="button" onClick={() => setScheduleMode("LATER")}
                  className={cn("min-h-11 py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                    scheduleMode === "LATER" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                  <CalendarClock className="w-3.5 h-3.5" /> {tf("scheduleLater")}
                </button>
              </div>
              {scheduleMode === "LATER" && (
                form.consultType === "CLINIC" && form.clinicId ? (
                  <div className="mt-3">
                    <TimeSlotPicker
                      doctorId={form.doctorId}
                      clinicId={form.clinicId}
                      value={scheduledAt}
                      onChange={setScheduledAt}
                    />
                  </div>
                ) : (
                  <input type="datetime-local" required className="input-field mt-3" min={nowLocalInput()}
                    value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                )
              )}
            </div>

            <div>
              <label className="input-label"><Users className="inline w-3.5 h-3.5 mr-1" />{tf("whoFor")}</label>
              <div className="grid grid-cols-4 gap-2">
                {RELATIONS.map((r) => (
                  <button key={r} type="button" onClick={() => { set("relation", r); setDependentId(null); }}
                    className={cn("min-h-11 py-2 rounded-xl border text-xs font-semibold transition-all",
                      form.relation === r ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}>
                    {tc(`relation.${r}`)}
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
              <label className="input-label">{tf("symptoms")}</label>
              <textarea required rows={3} className="input-field resize-none"
                placeholder={tf("symptomsPlaceholder")}
                value={form.symptoms} onChange={(e) => set("symptoms", e.target.value)} />
            </div>

            <div>
              <label className="input-label"><AlertTriangle className="inline w-3.5 h-3.5 mr-1 text-amber-500" />{tf("allergies")}</label>
              <textarea rows={2} className="input-field resize-none"
                placeholder={tf("allergiesPlaceholder")}
                value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
            </div>

            {/* Consent */}
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-4 py-3 cursor-pointer">
              <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-blue-500 flex-shrink-0" />
              <span className="text-xs text-slate-600 flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                {tf("consent")}
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
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {tc("booking")}</> : t("confirmBookingFee", { fee: currentFee })}
            </button>
          </div>
        </div>

        {/* Sticky booking summary (desktop only) */}
        <div className="hidden lg:block lg:sticky lg:top-24 mt-6 lg:mt-0">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">{t("summaryTitle")}</h3>

            {selectedDoctor?.doctorProfile ? (
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                {selectedDoctor.doctorProfile.photoUrl ? (
                  <Image
                    src={selectedDoctor.doctorProfile.photoUrl}
                    alt={selectedDoctor.name}
                    width={44}
                    height={44}
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
              <p className="text-sm text-slate-400 mb-4 pb-4 border-b border-slate-100">{t("summaryEmpty")}</p>
            )}

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{tc("consultation")}</span>
                <span className="font-semibold text-slate-800">{typeLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5"><CalendarCheck2 className="w-3.5 h-3.5" /> {tc("when")}</span>
                <span className="font-semibold text-slate-800">{scheduleMode === "LATER" ? t("scheduled") : tc("now")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{tc("payment")}</span>
                <span className="font-semibold text-slate-800">{t("online")}</span>
              </div>
              {form.consultType === "HOME" && distance != null && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("arrival")}</span>
                  <span className="font-semibold text-slate-800">{t("arrivalMin", { min: estimateArrivalMinutes(distance) })}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-slate-500 flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5" /> {tc("total")}</span>
                <span className="font-extrabold text-slate-900 text-lg">₹{currentFee}</span>
              </div>
            </div>

            <button type="submit" disabled={loading || !consentGiven || clinicBookingBlocked || homeVisitBlocked} className="btn-primary w-full justify-center py-3.5 text-base mt-5">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {tc("booking")}</> : t("confirmBooking")}
            </button>
          </div>
        </div>
        </form>
        )}
      </div>

      {profileGate.sheet}
      {confirmOpen && selectedDoctor && (
        <ConfirmDialog
          icon={CalendarCheck2}
          tone="primary"
          title={tf("confirmTitle")}
          confirmLabel={tf("confirmWithFee", { fee: currentFee })}
          busyLabel={tc("booking")}
          cancelLabel={tf("goBack")}
          busy={loading}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmAndBook}
          message={
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <span>{tc("doctor")}</span>
                <span className="font-semibold text-slate-700 text-right">{formatDoctorName(selectedDoctor.name)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{tc("consultation")}</span>
                <span className="font-semibold text-slate-700 text-right">{typeLabel}</span>
              </div>
              {form.consultType === "CLINIC" && selectedClinic && (
                <div className="flex justify-between gap-3">
                  <span>{tc("clinic")}</span>
                  <span className="font-semibold text-slate-700 text-right">{selectedClinic.name}</span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span>{tc("when")}</span>
                <span className="font-semibold text-slate-700 text-right">
                  {scheduleMode === "LATER" && scheduledAt
                    ? new Date(scheduledAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
                    : tc("now")}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{tc("payment")}</span>
                <span className="font-semibold text-slate-700 text-right">{tf("paymentAfterAccept")}</span>
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
