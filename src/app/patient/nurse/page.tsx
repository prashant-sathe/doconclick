"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2, ArrowLeft, HeartPulse, Star, ShieldCheck, MapPin, Clock, FileText, Upload, CheckCircle2,
  CalendarClock, Users, AlertTriangle, CalendarCheck2, Languages, BadgeCheck, LocateFixed,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import DependentPicker from "@/components/patient/DependentPicker";
import AddressAutocomplete from "@/components/patient/AddressAutocomplete";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useBookingProfileGate } from "@/components/patient/CompleteProfileSheet";
import { RELATIONS } from "@/lib/relations";
import { readPatientLocation } from "@/lib/patientLocation";
import { getCurrentPositionCompat } from "@/lib/platform";
import { isDoctorAvailableNow, formatAvailability } from "@/lib/availability";
import { buildVisitSchedule, isShift, PACKAGE_VISIT_OPTIONS, PACKAGE_INTERVAL_OPTIONS, SHIFT_MIN_LEAD_MS } from "@/lib/nursePackage";
import { patchPatientProfile } from "@/lib/usePatientProfile";
import { prepareUpload, tooBigMessage } from "@/lib/compressImage";
import { cn, formatProviderName } from "@/lib/utils";
import { GENDERS } from "@/lib/bookingProfile";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

type Service = { id: string; name: string; description: string | null; durationMinutes: number; suggestedPrice: number; requiresPrescription: boolean; kind?: string };
type Nurse = {
  id: string; name: string; photoUrl: string | null; qualification: string | null; experience: number; gender: string | null;
  languages: string; bio: string | null; availability: string; isVerified: boolean; policeVerified: boolean;
  avgRating: number; totalReviews: number; price: number; distanceKm: number | null;
  busyNow?: boolean; // on another visit right now — can still be booked for later
  awayNow?: boolean; // time off / offline right now (src/lib/timeOff.ts)
  awayUntil?: string | null; // last day off, or "today"
};

// The last day off, formatted — null when it's just today (or not away).
const awayUntilDate = (n: Nurse, locale: string) =>
  n.awayUntil && n.awayUntil !== "today"
    ? new Date(`${n.awayUntil}T00:00:00+05:30`).toLocaleDateString(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })
    : null;
const isGender = (g: string | null): g is (typeof GENDERS)[number] => !!g && (GENDERS as readonly string[]).includes(g);
// Stored document categories stay English; labels from patientAccount.documents.category.
const DOC_CATEGORY_KEY: Record<string, "labReport" | "prescription" | "scan" | "vaccination" | "discharge" | "other"> = {
  "Lab Report": "labReport", Prescription: "prescription", "Scan/X-ray": "scan",
  Vaccination: "vaccination", "Discharge Summary": "discharge", Other: "other",
};

// "As soon as possible" only makes sense inside working hours and when the nurse isn't mid-visit.
const canComeNow = (n: Nurse) => isDoctorAvailableNow(n.availability) && !n.busyNow && !n.awayNow;
type Doc = { id: string; title: string; category: string; createdAt: string };

// Labels are message keys (patientAccount.nurse.sort).
const SORTS = [{ id: "distance" }, { id: "rating" }, { id: "price" }] as const;

// Local "yyyy-mm-ddThh:mm" for <input type="datetime-local"> min.
function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PatientNurseContent() {
  const { user, loading: authLoading, requireTerms } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("patientAccount.nurse");
  const tc = useTranslations("booking.common");
  const tDoc = useTranslations("patientAccount.documents");
  const locale = formattingLocale(useLocale());
  const awayLabel = (n: Nurse) => {
    const until = awayUntilDate(n, locale);
    return until ? t("onLeaveUntil", { date: until }) : t("notToday");
  };
  const shiftLabel = (durationMinutes: number) => t("shiftLabel", { hours: Math.round(durationMinutes / 60) });
  const intervalLabel = (days: number) => t("interval", { days });
  const genderLabel = (g: string | null) => (isGender(g) ? tc(`gender.${g}`) : g);
  // "Book Again" from a completed visit: ?nurseId=…&serviceId=…
  const deepLink = useRef({ serviceId: searchParams.get("serviceId"), nurseId: searchParams.get("nurseId") });
  // "Book a nurse" from a doctor's consultation: ?serviceId=…&referralId=…
  const referralId = searchParams.get("referralId");
  const [referral, setReferral] = useState<{ id: string; service: { id: string; name: string }; visits: number; intervalDays: number; instructions: string | null; doctorName: string } | null>(null);
  const [notice, setNotice] = useState("");
  const profileGate = useBookingProfileGate();

  const [services, setServices] = useState<Service[] | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [nurses, setNurses] = useState<Nurse[] | null>(null);
  const [femaleOnly, setFemaleOnly] = useState(false);
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("distance");
  const [nurse, setNurse] = useState<Nurse | null>(null);

  // booking form
  const [relation, setRelation] = useState("Self");
  const [dependentId, setDependentId] = useState<string | null>(null);
  const [when, setWhen] = useState<"NOW" | "LATER">("NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [visits, setVisits] = useState(1);
  const [intervalDays, setIntervalDays] = useState(1);
  // The visit address. lat/lng belong to `coordsFor` — the text they were
  // picked or pinned for — so editing the address drops them and the patient
  // has to pick a suggestion (or pin GPS) again: a typed address alone can't
  // be booked. Landmark/flat and PIN are free text on top.
  const [address, setAddress] = useState({
    text: "", lat: null as number | null, lng: null as number | null, coordsFor: "",
    landmark: "", pinCode: "",
    saved: { text: "", landmark: "", pinCode: "", lat: null as number | null, lng: null as number | null },
  });
  const [pinningVisit, setPinningVisit] = useState(false);
  const visitPinned = address.lat != null && address.lng != null && address.coordsFor === address.text;
  // Where to look for nurses. The nurse travels to the visit address, so the
  // saved home address wins over GPS; an explicitly chosen browse location
  // (shared with the doctor map) wins over both. null = still resolving.
  const [searchLoc, setSearchLoc] = useState<{ lat: number; lng: number; label: string } | null | "none">(null);
  const [locating, setLocating] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [prescriptionDocId, setPrescriptionDocId] = useState("");
  const [uploadingRx, setUploadingRx] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [needsLocation, setNeedsLocation] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/patient/nurse");
  }, [authLoading, user, router]);

  useEffect(() => {
    fetch("/api/nurse-services").then((r) => (r.ok ? r.json() : [])).then(setServices).catch(() => setServices([]));
  }, []);

  const runSearch = async (s: Service, loc: typeof searchLoc) => {
    setNurses(null);
    const qs = new URLSearchParams({ serviceId: s.id, ...(loc && loc !== "none" ? { lat: String(loc.lat), lng: String(loc.lng) } : {}) });
    const r = await fetch(`/api/nurses/search?${qs}`);
    const d = r.ok ? await r.json() : { nurses: [] };
    setNeedsLocation(!!d.needsLocation);
    setNurses(d.nurses ?? []);
  };

  // Pins the visit address to where the phone is now (e.g. typed a flat
  // address the suggestions don't know). Fills the address/PIN from the
  // reverse lookup only when they're empty.
  const pinVisitToGps = async () => {
    setPinningVisit(true);
    setError("");
    try {
      const pos = await getCurrentPositionCompat({ enableHighAccuracy: true, timeout: 10000 });
      const { latitude: lat, longitude: lng } = pos.coords;
      const d = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lng}`).then((r) => r.json()).catch(() => ({}));
      setAddress((a) => {
        const text = a.text.trim() ? a.text : d.label ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const pinCode = a.pinCode || (typeof d.pinCode === "string" && /^\d{6}$/.test(d.pinCode) ? d.pinCode : "");
        return { ...a, text, pinCode, lat, lng, coordsFor: text };
      });
    } catch {
      setError(t("errGpsVisit"));
    } finally {
      setPinningVisit(false);
    }
  };

  const locateWithGps = async (silent = false) => {
    setLocating(true);
    try {
      const pos = await getCurrentPositionCompat({ enableHighAccuracy: true, timeout: 10000 });
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: t("locCurrent") };
      setSearchLoc(loc);
      if (service) runSearch(service, loc);
    } catch {
      setSearchLoc("none");
      if (!silent) setError(t("errGpsSearch"));
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!user?.id || user.role !== "PATIENT") return;
    fetch("/api/patients/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const p = d?.patientProfile;
      if (p) {
        const saved = { text: p.homeAddress ?? "", landmark: p.landmark ?? "", pinCode: p.pinCode ?? "", lat: p.lat ?? null, lng: p.lng ?? null };
        setAddress({ ...saved, coordsFor: saved.lat != null ? saved.text : "", saved });
      }
      const chosen = readPatientLocation();
      if (chosen) { setSearchLoc(chosen); return; }
      if (p?.lat != null && p?.lng != null) { setSearchLoc({ lat: p.lat, lng: p.lng, label: t("locHome") }); return; }
      locateWithGps(true);
    });
    // Keyed on the account id, not the `user` object: AuthProvider hands out a
    // fresh object on every refresh (e.g. after the profile sheet saves the
    // name), and re-running this would wipe the visit address being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);


  const loadDocs = useCallback(async () => {
    const r = await fetch("/api/patients/me/documents");
    if (r.ok) setDocs(await r.json());
  }, []);


  const pickService = async (s: Service) => {
    setService(s); setNurse(null); setError("");
    window.scrollTo({ top: 0 });
    await runSearch(s, searchLoc);
  };

  const pickNurse = (n: Nurse) => {
    setNurse(n); setError(""); setConsent(false); setPrescriptionDocId("");
    // Off-hours right now → "as soon as possible" isn't on offer; start on a picked time.
    // Shifts are planned care — always a picked start time.
    setWhen(!isShift(service) && canComeNow(n) ? "NOW" : "LATER");
    if (service?.requiresPrescription) loadDocs();
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!referralId || !user?.id) return;
    fetch(`/api/nurse-referrals/${referralId}`).then(async (res) => {
      const r = await res.json().catch(() => null);
      if (!res.ok || !r) {
        // e.g. the consultation it came from was cancelled (src/lib/nurseReferral.ts).
        setNotice(t("referralNotice", { error: r?.error ?? t("referralNotFound") }));
        return;
      }
      setReferral(r);
      setVisits(r.visits);
      setIntervalDays(r.intervalDays);
      if (r.instructions) setNotes((n) => n || r.instructions);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referralId, user?.id]);

  // Deep link step 1: once services and the search location are known, open the service.
  useEffect(() => {
    const id = deepLink.current.serviceId;
    if (!id || !services || searchLoc === null || service) return;
    // From a doctor's referral: wait for its details (visits, prescription)
    // so the form never shows a moment of "1 visit, upload a prescription".
    if (referralId && !referral && !notice) return;
    deepLink.current.serviceId = null;
    const s = services.find((x) => x.id === id);
    if (s) pickService(s);
    else setNotice(t("serviceGone"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, searchLoc, referral, notice]);

  // Deep link step 2: once that service's nurses are listed, open the same nurse.
  useEffect(() => {
    const id = deepLink.current.nurseId;
    if (!id || !nurses || !service) return;
    deepLink.current.nurseId = null;
    const n = nurses.find((x) => x.id === id);
    if (n) pickNurse(n);
    else if (!needsLocation) setNotice(t("nurseGone"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurses]);

  // Exact dates the package will use (same function the server books with).
  const visitStart = when === "LATER" && scheduledAt ? new Date(scheduledAt) : null;
  const shiftMode = isShift(service);
  const schedulePreview = nurse && (visits > 1 || shiftMode)
    ? buildVisitSchedule(visitStart ?? new Date(), visits, shiftMode ? 1 : intervalDays, shiftMode ? null : nurse.availability)
    : [];
  const fmtShift = (d: Date) => {
    const end = new Date(d.getTime() + (service?.durationMinutes ?? 0) * 60000);
    return `${fmtDay(d)} → ${end.toLocaleString(locale, { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
  };
  const total = nurse ? nurse.price * visits : 0;
  const fmtDay = (d: Date) => d.toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  const shown = useMemo(() => {
    const list = (nurses ?? []).filter((n) => !femaleOnly || n.gender === "Female");
    return [...list].sort((a, b) =>
      sort === "price" ? a.price - b.price
        : sort === "rating" ? b.avgRating - a.avgRating
          : (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    );
  }, [nurses, femaleOnly, sort]);

  const uploadPrescription = async (original: File) => {
    setUploadingRx(true); setError("");
    const file = await prepareUpload(original).catch(() => null);
    if (!file) { setUploadingRx(false); setError(t("errReadFile")); return; }
    const tooBig = tooBigMessage(file);
    if (tooBig) { setUploadingRx(false); setError(tooBig); return; }
    const fd = new FormData();
    fd.append("title", `Prescription for ${service?.name ?? "nurse visit"}`);
    fd.append("category", "Prescription");
    fd.append("file", file);
    const r = await fetch("/api/patients/me/documents", { method: "POST", body: fd });
    setUploadingRx(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? t("uploadFailed")); return; }
    const created = await r.json();
    await loadDocs();
    setPrescriptionDocId(created.id);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!service || !nurse) return;
    if (relation !== "Self" && !dependentId) { setError(t("errDependent")); return; }
    if (when === "LATER" && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) { setError(t("errFuture")); return; }
    const visitAt = when === "LATER" && scheduledAt ? new Date(scheduledAt) : new Date();
    if (isShift(service)) {
      if (!scheduledAt || visitAt.getTime() < Date.now() + SHIFT_MIN_LEAD_MS) { setError(t("errShiftLead")); return; }
    } else if (!isDoctorAvailableNow(nurse.availability, visitAt)) {
      setError(t("errHours", { name: formatProviderName(nurse.name, "NURSE"), hours: formatAvailability(nurse.availability) }));
      return;
    }
    if (!address.text.trim()) { setError(t("errAddress")); return; }
    if (!visitPinned) { setError(t("errPinned")); return; }
    if (address.pinCode && !/^\d{6}$/.test(address.pinCode)) { setError(t("errPin")); return; }
    if (service.requiresPrescription && !prescriptionDocId && !(referral && referral.service.id === service.id)) { setError(t("errRx", { service: service.name })); return; }
    if (!consent) { setError(t("errConsent")); return; }
    setError("");
    profileGate.run(!!dependentId, () => setConfirmOpen(true));
  };

  const confirmAndBook = async () => {
    if (!service || !nurse) return;
    setBooking(true); setError("");
    try {
      // Keep the visit address on the profile for next time. The booking
      // itself carries its own copy (`visit`), so this is only a convenience.
      const sv = address.saved;
      if (address.text.trim() !== sv.text.trim() || address.landmark.trim() !== sv.landmark.trim()
        || address.pinCode !== sv.pinCode || address.lat !== sv.lat || address.lng !== sv.lng) {
        await patchPatientProfile({
          homeAddress: address.text.trim(),
          landmark: address.landmark.trim() || null,
          ...(address.pinCode ? { pinCode: address.pinCode } : {}),
          lat: address.lat,
          lng: address.lng,
        });
        setAddress((a) => ({ ...a, saved: { text: a.text, landmark: a.landmark, pinCode: a.pinCode, lat: a.lat, lng: a.lng } }));
      }
      const res = await fetch("/api/nurse-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nurseId: nurse.id,
          serviceId: service.id,
          notes,
          dependentId,
          consentGiven: consent,
          prescriptionDocId: prescriptionDocId || undefined,
          visits,
          intervalDays,
          ...(referral && referral.service.id === service.id ? { nurseReferralId: referral.id } : {}),
          ...(when === "LATER" && scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
          // Snapshotted onto the booking — where the nurse goes, and what
          // her travel radius is checked against.
          visit: {
            address: address.text.trim(),
            landmark: address.landmark.trim() || undefined,
            pinCode: address.pinCode || undefined,
            lat: address.lat,
            lng: address.lng,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      setConfirmOpen(false);
      if (res.ok) { setBooked(true); window.scrollTo({ top: 0 }); return; }
      if (data.code === "TERMS_REQUIRED") requireTerms(() => setConfirmOpen(true));
      else if (data.code === "PROFILE_INCOMPLETE") profileGate.open(data.missing, () => setConfirmOpen(true));
      else setError(data.error ?? t("bookingFailed"));
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : t("bookingFailed"));
    } finally {
      setBooking(false);
    }
  };

  if (authLoading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  const back = () => { setError(""); setNotice(""); if (nurse) setNurse(null); else { setService(null); setNurses(null); } };

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {booked && nurse && service ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CalendarCheck2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900">{t("sentTitle")}</h1>
            <p className="text-sm text-slate-500 mt-2">
              {t("sentBody", { name: formatProviderName(nurse.name, "NURSE"), service: service.name, visits })}
            </p>
            <Link href="/patient/appointments" className="btn-primary w-full justify-center py-3 mt-6">{t("viewAppointments")}</Link>
          </div>
        ) : (
          <>
            {(service || nurse) && (
              <button onClick={back} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 mb-4">
                <ArrowLeft className="w-4 h-4" /> {t("back")}
              </button>
            )}

            {notice && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 mb-4">{notice}</div>
            )}
            {!service && (
              <>
                <div className="mb-5">
                  <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2"><HeartPulse className="w-6 h-6 text-rose-500" />{t("title")}</h1>
                  <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
                </div>
                {services === null ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                ) : (
                  <div className="space-y-5">
                  {[
                    { id: "home", title: t("groupHome"), items: services.filter((s) => !isShift(s)) },
                    { id: "shift", title: t("groupShift"), items: services.filter((s) => isShift(s)) },
                  ].filter((g) => g.items.length > 0).map((g) => (
                  <div key={g.id}>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{g.title}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {g.items.map((s) => (
                      <button key={s.id} onClick={() => pickService(s)} className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-rose-300 hover:shadow transition-all">
                        <p className="font-bold text-slate-900">{s.name}</p>
                        {s.description && <p className="text-xs text-slate-500 mt-1">{s.description}</p>}
                        <p className="text-xs text-slate-400 mt-2 flex items-center gap-2">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{isShift(s) ? shiftLabel(s.durationMinutes) : t("approxMin", { min: s.durationMinutes })}</span>
                          {s.suggestedPrice > 0 && <span>{t("fromPrice", { price: s.suggestedPrice })}</span>}
                        </p>
                        {s.requiresPrescription && (
                          <p className="text-[11px] font-semibold text-amber-600 mt-1.5 flex items-center gap-1"><FileText className="w-3 h-3" />{t("rxNeeded")}</p>
                        )}
                      </button>
                    ))}
                  </div>
                  </div>
                  ))}
                  </div>
                )}
              </>
            )}

            {service && !nurse && (
              <>
                <h1 className="text-xl font-extrabold text-slate-900">{service.name}</h1>
                <p className="text-sm text-slate-500 mb-4">{t("nearYou")}</p>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {SORTS.map((s) => (
                    <button key={s.id} onClick={() => setSort(s.id)} className={cn("min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border", sort === s.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}>{t(`sort.${s.id}`)}</button>
                  ))}
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 ml-auto">
                    <input type="checkbox" checked={femaleOnly} onChange={(e) => setFemaleOnly(e.target.checked)} className="accent-rose-500" />
                    {t("femaleOnly")}
                  </label>
                </div>
                {searchLoc && searchLoc !== "none" && !needsLocation && (
                  <p className="text-xs text-slate-500 mb-3 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{t("showingNear", { label: searchLoc.label })}</p>
                )}
                {nurses === null ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                ) : needsLocation ? (
                  <div className="bg-white rounded-2xl border border-amber-200 p-6 text-center">
                    <p className="text-sm font-semibold text-slate-800">{t("whereTitle")}</p>
                    <p className="text-xs text-slate-500 mt-1 mb-4">{t("whereBody")}</p>
                    <button onClick={() => locateWithGps()} disabled={locating} className="btn-primary py-2.5 px-4 text-sm mx-auto">
                      {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />} {t("useLocation")}
                    </button>
                    <Link href="/patient/profile/address" className="block text-xs font-semibold text-blue-600 mt-3">{t("addHome")}</Link>
                  </div>
                ) : shown.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                    <p className="text-sm text-slate-500">{t("noneTitle")}</p>
                    <p className="text-xs text-slate-400 mt-1">{t("noneBody")}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {shown.map((n) => (
                      <button key={n.id} onClick={() => pickNurse(n)} className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-rose-300 transition-all flex gap-3">
                        <div className="w-14 h-14 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {n.photoUrl ? <Image src={n.photoUrl} alt={n.name} width={56} height={56} className="w-full h-full object-cover" /> : <HeartPulse className="w-6 h-6 text-rose-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-bold text-slate-900 truncate flex items-center gap-1">
                              {formatProviderName(n.name, "NURSE")}
                              {n.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                            </p>
                            <p className="text-sm font-extrabold text-slate-900 flex-shrink-0">₹{n.price}</p>
                          </div>
                          <p className="text-xs text-slate-500">{[n.qualification, n.experience ? t("yrsExp", { years: n.experience }) : null, genderLabel(n.gender)].filter(Boolean).join(" · ")}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                            {n.totalReviews > 0 && <span className="flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{n.avgRating.toFixed(1)} ({n.totalReviews})</span>}
                            {n.distanceKm != null && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{n.distanceKm} km</span>}
                            {n.policeVerified && <span className="flex items-center gap-0.5 text-emerald-600 font-semibold"><ShieldCheck className="w-3 h-3" />{t("policeVerified")}</span>}
                            {n.awayNow
                              ? <span className="flex items-center gap-0.5 text-amber-600 font-semibold"><Clock className="w-3 h-3" />{t("awayBookLater", { away: awayLabel(n) })}</span>
                              : shiftMode
                              ? <span className="flex items-center gap-0.5 text-emerald-600 font-semibold"><Clock className="w-3 h-3" />{t("takesShifts")}</span>
                              : !isDoctorAvailableNow(n.availability)
                              ? <span className="flex items-center gap-0.5 text-slate-400"><Clock className="w-3 h-3" />{formatAvailability(n.availability)}</span>
                              : n.busyNow
                                ? <span className="flex items-center gap-0.5 text-amber-600 font-semibold"><Clock className="w-3 h-3" />{t("busyBookLater")}</span>
                                : <span className="flex items-center gap-0.5 text-emerald-600 font-semibold"><Clock className="w-3 h-3" />{t("availableNow")}</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {service && nurse && (
              <form onSubmit={submit} className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex gap-3">
                  <div className="w-14 h-14 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {nurse.photoUrl ? <Image src={nurse.photoUrl} alt={nurse.name} width={56} height={56} className="w-full h-full object-cover" /> : <HeartPulse className="w-6 h-6 text-rose-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{formatProviderName(nurse.name, "NURSE")}</p>
                    <p className="text-xs text-slate-500">{[nurse.qualification, nurse.experience ? t("yrsExp", { years: nurse.experience }) : null].filter(Boolean).join(" · ")}</p>
                    {nurse.languages && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Languages className="w-3 h-3" />{nurse.languages}</p>}
                    {nurse.bio && <p className="text-xs text-slate-500 mt-1.5">{nurse.bio}</p>}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2.5">
                    <p className="text-sm font-semibold text-rose-700">{service.name}</p>
                    <p className="text-sm font-extrabold text-rose-700">₹{nurse.price}</p>
                  </div>

                  <div>
                    <label className="input-label"><Users className="inline w-3.5 h-3.5 mr-1" />{t("whoFor")}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {RELATIONS.map((r) => (
                        <button key={r} type="button" onClick={() => { setRelation(r); setDependentId(null); }}
                          className={cn("min-h-11 py-2 rounded-xl border text-xs font-semibold", relation === r ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                          {tc(`relation.${r}`)}
                        </button>
                      ))}
                    </div>
                    {relation !== "Self" && (
                      <div className="mt-3"><DependentPicker key={relation} relation={relation} selectedId={dependentId} onSelect={setDependentId} /></div>
                    )}
                  </div>

                  <div>
                    <label className="input-label"><CalendarClock className="inline w-3.5 h-3.5 mr-1" />{t("when")}</label>
                    <div className={cn("grid gap-2", shiftMode ? "grid-cols-1" : "grid-cols-2")}>
                      {(shiftMode ? (["LATER"] as const) : (["NOW", "LATER"] as const)).map((w) => {
                        const off = w === "NOW" && !canComeNow(nurse);
                        return (
                          <button key={w} type="button" disabled={off} onClick={() => { setWhen(w); setError(""); }}
                            className={cn("py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed", when === w ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                            {w === "NOW" ? t("asap") : shiftMode ? t("shiftStartsAt") : t("pickTime")}
                          </button>
                        );
                      })}
                    </div>
                    {when === "LATER" && (
                      <input type="datetime-local" className="input-field mt-2" min={localInputValue(new Date())} value={scheduledAt} onChange={(e) => { setScheduledAt(e.target.value); setError(""); }} />
                    )}
                    {shiftMode ? (
                      <p className="text-[11px] text-slate-400 mt-1">{t("shiftHint", { shift: shiftLabel(service.durationMinutes) })}</p>
                    ) : (
                    <p className="text-[11px] text-slate-400 mt-1">
                      {(() => {
                        const hours = formatAvailability(nurse.availability);
                        const until = awayUntilDate(nurse, locale);
                        return nurse.awayNow
                          ? until ? t("worksAwayUntil", { hours, date: until }) : t("worksAwayToday", { hours })
                          : !isDoctorAvailableNow(nurse.availability)
                          ? t("worksOff", { hours })
                          : nurse.busyNow ? t("worksBusy", { hours }) : t("works", { hours });
                      })()}
                    </p>
                    )}
                  </div>

                  <div>
                    <label className="input-label">{shiftMode ? t("howManyShifts") : t("howManyVisits")}</label>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                      {PACKAGE_VISIT_OPTIONS.map((n) => (
                        <button key={n} type="button" onClick={() => { setVisits(n); setError(""); }}
                          className={cn("min-h-11 py-2 rounded-xl border text-sm font-semibold", visits === n ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                          {n}
                        </button>
                      ))}
                    </div>
                    {(visits > 1 || shiftMode) && (
                      <>
                        <div className={cn("grid grid-cols-3 gap-2 mt-2", shiftMode && "hidden")}>
                          {PACKAGE_INTERVAL_OPTIONS.map((n) => (
                            <button key={n} type="button" onClick={() => { setIntervalDays(n); setError(""); }}
                              className={cn("min-h-11 py-2 rounded-xl border text-xs font-semibold", intervalDays === n ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                              {intervalLabel(n)}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <p className="text-xs font-semibold text-slate-700 mb-1.5">
                            {shiftMode ? t("yourShifts", { count: visits }) : when === "NOW" ? t("yourVisitsNow", { count: visits }) : t("yourVisits", { count: visits })}
                          </p>
                          {shiftMode && !scheduledAt ? (
                            <p className="text-xs text-slate-400">{t("pickStartToSee")}</p>
                          ) : (
                            <ol className="text-xs text-slate-600 space-y-0.5 list-decimal list-inside">
                              {schedulePreview.map((d, i) => <li key={i}>{shiftMode ? fmtShift(d) : i === 0 && when === "NOW" ? t("asap") : fmtDay(d)}</li>)}
                            </ol>
                          )}
                          <p className="text-[11px] text-slate-400 mt-1.5">
                            {shiftMode ? t("shiftsNote") : t("visitsNote", { name: formatProviderName(nurse.name, "NURSE") })}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="input-label"><MapPin className="inline w-3.5 h-3.5 mr-1" />{t("visitAddress")}</label>
                    <AddressAutocomplete
                      multiline
                      value={address.text}
                      onChange={(v) => setAddress((a) => ({ ...a, text: v }))}
                      onSelect={(s) => setAddress((a) => ({ ...a, text: s.label, lat: s.lat, lng: s.lon, coordsFor: s.label }))}
                      placeholder={t("addressPlaceholder")}
                    />
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      {visitPinned ? (
                        <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{t("locationSet")}</p>
                      ) : (
                        <p className="text-[11px] text-amber-600 font-semibold">{t("pickSuggestion")}</p>
                      )}
                      <button type="button" onClick={pinVisitToGps} disabled={pinningVisit}
                        className="text-[11px] font-semibold text-blue-600 flex items-center gap-1 disabled:opacity-60">
                        {pinningVisit ? <Loader2 className="w-3 h-3 animate-spin" /> : <LocateFixed className="w-3 h-3" />} {t("useLocation")}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <input className="input-field col-span-2" placeholder={t("landmarkPlaceholder")} maxLength={120}
                        value={address.landmark} onChange={(e) => setAddress((a) => ({ ...a, landmark: e.target.value }))} />
                      <input className="input-field" inputMode="numeric" placeholder={t("pinPlaceholder")} maxLength={6}
                        value={address.pinCode} onChange={(e) => setAddress((a) => ({ ...a, pinCode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{t("savedForNext")}</p>
                  </div>

                  {referral && referral.service.id === service.id && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{t("referralAttached", { doctor: formatProviderName(referral.doctorName, "DOCTOR") })}</p>
                      <p className="text-xs text-emerald-700 mt-0.5">{t("referralBody")}</p>
                    </div>
                  )}

                  {service.requiresPrescription && !(referral && referral.service.id === service.id) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5"><FileText className="w-4 h-4" />{t("rxRequired")}</p>
                      <p className="text-xs text-amber-700 mt-0.5 mb-2">{t("rxOnlyPrescribed", { service: service.name.toLowerCase() })}</p>
                      {docs.length > 0 && (
                        <select className="input-field mb-2" value={prescriptionDocId} onChange={(e) => { setPrescriptionDocId(e.target.value); setError(""); }}>
                          <option value="">{t("chooseDoc")}</option>
                          {docs.map((d) => <option key={d.id} value={d.id}>{d.title} ({DOC_CATEGORY_KEY[d.category] ? tDoc(`category.${DOC_CATEGORY_KEY[d.category]}`) : d.category})</option>)}
                        </select>
                      )}
                      <label className={cn("btn-secondary py-2 px-3 text-xs cursor-pointer inline-flex", uploadingRx && "opacity-60 pointer-events-none")}>
                        {uploadingRx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {t("uploadRx")}
                        <input type="file" className="hidden" accept="application/pdf,image/jpeg,image/png"
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadPrescription(f); }} />
                      </label>
                      {prescriptionDocId && <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{t("rxAttached")}</p>}
                    </div>
                  )}

                  <div>
                    <label className="input-label">{t("notesLabel")}</label>
                    <textarea rows={2} className="input-field" placeholder={t("notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-slate-600">
                    <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(""); }} className="w-4 h-4 mt-0.5 accent-blue-500 flex-shrink-0" />
                    {t("consent")}
                  </label>

                  {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-start gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}</div>}

                  <button type="submit" disabled={booking} className="btn-primary w-full justify-center py-3.5 text-base">
                    {shiftMode ? t("requestShifts", { count: visits, total }) : visits > 1 ? t("requestVisits", { count: visits, total }) : t("requestVisit", { price: nurse.price })}
                  </button>
                  <p className="text-[11px] text-slate-400 text-center">{t("payAfter")}</p>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      {profileGate.sheet}
      {confirmOpen && service && nurse && (
        <ConfirmDialog
          icon={CalendarCheck2}
          tone="primary"
          title={shiftMode ? t("confirm.titleShift") : t("confirm.titleVisit")}
          message={
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3"><span>{t("confirm.nurse")}</span><span className="font-semibold text-slate-800 text-right">{formatProviderName(nurse.name, "NURSE")}</span></div>
              <div className="flex justify-between gap-3"><span>{t("confirm.service")}</span><span className="font-semibold text-slate-800 text-right">{service.name}</span></div>
              {(visits > 1 || shiftMode) && (
                <div className="flex justify-between gap-3"><span>{shiftMode ? t("confirm.shifts") : t("confirm.visits")}</span><span className="font-semibold text-slate-800 text-right">{t("confirm.each", { detail: shiftMode ? `${visits} × ${shiftLabel(service.durationMinutes)}` : `${visits} · ${intervalLabel(intervalDays)}`, price: nurse.price })}</span></div>
              )}
              <div className="flex justify-between gap-3"><span>{visits > 1 ? t("confirm.firstVisit") : t("confirm.when")}</span><span className="font-semibold text-slate-800 text-right">{when === "LATER" && scheduledAt ? new Date(scheduledAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : t("asap")}</span></div>
              <div className="flex justify-between gap-3"><span>{t("confirm.payment")}</span><span className="font-semibold text-slate-800 text-right">{t("confirm.paymentValue")}</span></div>
            </div>
          }
          confirmLabel={t("confirm.confirm", { total })}
          busyLabel={t("confirm.busy")}
          busy={booking}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmAndBook}
        />
      )}
    </div>
  );
}

export default function PatientNursePage() {
  return (
    <Suspense fallback={<div className="min-h-screen gradient-surface" />}>
      <PatientNurseContent />
    </Suspense>
  );
}
