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
import { buildVisitSchedule, intervalLabel, PACKAGE_VISIT_OPTIONS, PACKAGE_INTERVAL_OPTIONS } from "@/lib/nursePackage";
import { patchPatientProfile } from "@/lib/usePatientProfile";
import { prepareUpload, tooBigMessage } from "@/lib/compressImage";
import { cn, formatProviderName } from "@/lib/utils";

type Service = { id: string; name: string; description: string | null; durationMinutes: number; suggestedPrice: number; requiresPrescription: boolean };
type Nurse = {
  id: string; name: string; photoUrl: string | null; qualification: string | null; experience: number; gender: string | null;
  languages: string; bio: string | null; availability: string; isVerified: boolean; policeVerified: boolean;
  avgRating: number; totalReviews: number; price: number; distanceKm: number | null;
  busyNow?: boolean; // on another visit right now — can still be booked for later
};

// "As soon as possible" only makes sense inside working hours and when the nurse isn't mid-visit.
const canComeNow = (n: Nurse) => isDoctorAvailableNow(n.availability) && !n.busyNow;
type Doc = { id: string; title: string; category: string; createdAt: string };

const SORTS = [
  { id: "distance", label: "Nearest" },
  { id: "rating", label: "Top rated" },
  { id: "price", label: "Lowest price" },
] as const;

// Local "yyyy-mm-ddThh:mm" for <input type="datetime-local"> min.
function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PatientNurseContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [address, setAddress] = useState({ text: "", lat: null as number | null, lng: null as number | null, saved: "" });
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

  const locateWithGps = async (silent = false) => {
    setLocating(true);
    try {
      const pos = await getCurrentPositionCompat({ enableHighAccuracy: true, timeout: 10000 });
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "your current location" };
      setSearchLoc(loc);
      if (service) runSearch(service, loc);
    } catch {
      setSearchLoc("none");
      if (!silent) setError("Couldn't get your location. Allow location access, or add your home address in your profile.");
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!user?.id || user.role !== "PATIENT") return;
    fetch("/api/patients/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const p = d?.patientProfile;
      if (p) setAddress({ text: p.homeAddress ?? "", lat: p.lat ?? null, lng: p.lng ?? null, saved: p.homeAddress ?? "" });
      const chosen = readPatientLocation();
      if (chosen) { setSearchLoc(chosen); return; }
      if (p?.lat != null && p?.lng != null) { setSearchLoc({ lat: p.lat, lng: p.lng, label: "your home address" }); return; }
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
    setWhen(canComeNow(n) ? "NOW" : "LATER");
    if (service?.requiresPrescription) loadDocs();
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!referralId || !user?.id) return;
    fetch(`/api/nurse-referrals/${referralId}`).then((r) => (r.ok ? r.json() : null)).then((r) => {
      if (!r) { setNotice("That referral wasn't found — you can still book a nurse below."); return; }
      setReferral(r);
      setVisits(r.visits);
      setIntervalDays(r.intervalDays);
      if (r.instructions) setNotes((n) => n || r.instructions);
    });
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
    else setNotice("That service isn't offered any more — please choose another.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, searchLoc, referral, notice]);

  // Deep link step 2: once that service's nurses are listed, open the same nurse.
  useEffect(() => {
    const id = deepLink.current.nurseId;
    if (!id || !nurses || !service) return;
    deepLink.current.nurseId = null;
    const n = nurses.find((x) => x.id === id);
    if (n) pickNurse(n);
    else if (!needsLocation) setNotice("That nurse isn't available for this service near you right now — here are other nurses.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurses]);

  // Exact dates the package will use (same function the server books with).
  const visitStart = when === "LATER" && scheduledAt ? new Date(scheduledAt) : null;
  const schedulePreview = nurse && visits > 1
    ? buildVisitSchedule(visitStart ?? new Date(), visits, intervalDays, nurse.availability)
    : [];
  const total = nurse ? nurse.price * visits : 0;
  const fmtDay = (d: Date) => d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

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
    if (!file) { setUploadingRx(false); setError("Couldn't read that file — please pick it again."); return; }
    const tooBig = tooBigMessage(file);
    if (tooBig) { setUploadingRx(false); setError(tooBig); return; }
    const fd = new FormData();
    fd.append("title", `Prescription for ${service?.name ?? "nurse visit"}`);
    fd.append("category", "Prescription");
    fd.append("file", file);
    const r = await fetch("/api/patients/me/documents", { method: "POST", body: fd });
    setUploadingRx(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Upload failed."); return; }
    const created = await r.json();
    await loadDocs();
    setPrescriptionDocId(created.id);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!service || !nurse) return;
    if (relation !== "Self" && !dependentId) { setError("Please select or add the family member this visit is for."); return; }
    if (when === "LATER" && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) { setError("Please pick a time in the future."); return; }
    const visitAt = when === "LATER" && scheduledAt ? new Date(scheduledAt) : new Date();
    if (!isDoctorAvailableNow(nurse.availability, visitAt)) {
      setError(`${formatProviderName(nurse.name, "NURSE")} works ${formatAvailability(nurse.availability)}. Please pick a time within those hours.`);
      return;
    }
    if (!address.text.trim()) { setError("Please add the address where the nurse should come."); return; }
    if (service.requiresPrescription && !prescriptionDocId && !(referral && referral.service.id === service.id)) { setError(`${service.name} needs a doctor's prescription. Please attach one.`); return; }
    if (!consent) { setError("Please agree to the consent statement to continue."); return; }
    setError("");
    profileGate.run(!!dependentId, () => setConfirmOpen(true));
  };

  const confirmAndBook = async () => {
    if (!service || !nurse) return;
    setBooking(true); setError("");
    try {
      // Keep the visit address on the profile — it's where the nurse goes.
      if (address.text.trim() !== address.saved.trim()) {
        await patchPatientProfile({
          homeAddress: address.text.trim(),
          ...(address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : {}),
        });
        setAddress((a) => ({ ...a, saved: a.text }));
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
          // The visit address's own coordinates; else wherever we searched from.
          ...(address.lat != null && address.lng != null
            ? { patientLat: address.lat, patientLng: address.lng }
            : searchLoc && searchLoc !== "none" ? { patientLat: searchLoc.lat, patientLng: searchLoc.lng } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      setConfirmOpen(false);
      if (res.ok) { setBooked(true); window.scrollTo({ top: 0 }); return; }
      if (data.code === "PROFILE_INCOMPLETE") profileGate.open(data.missing, () => setConfirmOpen(true));
      else setError(data.error ?? "Booking failed. Please try again.");
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : "Booking failed. Please try again.");
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
            <h1 className="text-xl font-extrabold text-slate-900">Request sent!</h1>
            <p className="text-sm text-slate-500 mt-2">
              {formatProviderName(nurse.name, "NURSE")} will confirm your {service.name} {visits > 1 ? `package (${visits} visits)` : "visit"} shortly. You&apos;ll pay once they accept.
            </p>
            <Link href="/patient/appointments" className="btn-primary w-full justify-center py-3 mt-6">View my appointments</Link>
          </div>
        ) : (
          <>
            {(service || nurse) && (
              <button onClick={back} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 mb-4">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}

            {notice && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 mb-4">{notice}</div>
            )}
            {!service && (
              <>
                <div className="mb-5">
                  <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2"><HeartPulse className="w-6 h-6 text-rose-500" />Book a Nurse</h1>
                  <p className="text-sm text-slate-500 mt-1">A registered nurse comes to your home. What do you need?</p>
                </div>
                {services === null ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {services.map((s) => (
                      <button key={s.id} onClick={() => pickService(s)} className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-rose-300 hover:shadow transition-all">
                        <p className="font-bold text-slate-900">{s.name}</p>
                        {s.description && <p className="text-xs text-slate-500 mt-1">{s.description}</p>}
                        <p className="text-xs text-slate-400 mt-2 flex items-center gap-2">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />~{s.durationMinutes} min</span>
                          {s.suggestedPrice > 0 && <span>from ~₹{s.suggestedPrice}</span>}
                        </p>
                        {s.requiresPrescription && (
                          <p className="text-[11px] font-semibold text-amber-600 mt-1.5 flex items-center gap-1"><FileText className="w-3 h-3" />Doctor&apos;s prescription needed</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {service && !nurse && (
              <>
                <h1 className="text-xl font-extrabold text-slate-900">{service.name}</h1>
                <p className="text-sm text-slate-500 mb-4">Nurses near you who offer this service</p>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {SORTS.map((s) => (
                    <button key={s.id} onClick={() => setSort(s.id)} className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", sort === s.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}>{s.label}</button>
                  ))}
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 ml-auto">
                    <input type="checkbox" checked={femaleOnly} onChange={(e) => setFemaleOnly(e.target.checked)} className="accent-rose-500" />
                    Female nurse only
                  </label>
                </div>
                {searchLoc && searchLoc !== "none" && !needsLocation && (
                  <p className="text-xs text-slate-500 mb-3 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />Showing nurses near {searchLoc.label}</p>
                )}
                {nurses === null ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                ) : needsLocation ? (
                  <div className="bg-white rounded-2xl border border-amber-200 p-6 text-center">
                    <p className="text-sm font-semibold text-slate-800">Where should the nurse come?</p>
                    <p className="text-xs text-slate-500 mt-1 mb-4">We need your location to find nurses who travel to you.</p>
                    <button onClick={() => locateWithGps()} disabled={locating} className="btn-primary py-2.5 px-4 text-sm mx-auto">
                      {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />} Use my current location
                    </button>
                    <Link href="/patient/profile/address" className="block text-xs font-semibold text-blue-600 mt-3">or add your home address →</Link>
                  </div>
                ) : shown.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                    <p className="text-sm text-slate-500">No nurse near you offers this service right now.</p>
                    <p className="text-xs text-slate-400 mt-1">Try another service, or check that your home address / location is set in your profile.</p>
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
                          <p className="text-xs text-slate-500">{[n.qualification, n.experience ? `${n.experience} yrs exp` : null, n.gender].filter(Boolean).join(" · ")}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                            {n.totalReviews > 0 && <span className="flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{n.avgRating.toFixed(1)} ({n.totalReviews})</span>}
                            {n.distanceKm != null && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{n.distanceKm} km</span>}
                            {n.policeVerified && <span className="flex items-center gap-0.5 text-emerald-600 font-semibold"><ShieldCheck className="w-3 h-3" />Police verified</span>}
                            {!isDoctorAvailableNow(n.availability)
                              ? <span className="flex items-center gap-0.5 text-slate-400"><Clock className="w-3 h-3" />{formatAvailability(n.availability)}</span>
                              : n.busyNow
                                ? <span className="flex items-center gap-0.5 text-amber-600 font-semibold"><Clock className="w-3 h-3" />On a visit now — book for later</span>
                                : <span className="flex items-center gap-0.5 text-emerald-600 font-semibold"><Clock className="w-3 h-3" />Available now</span>}
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
                    <p className="text-xs text-slate-500">{[nurse.qualification, nurse.experience ? `${nurse.experience} yrs exp` : null].filter(Boolean).join(" · ")}</p>
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
                    <label className="input-label"><Users className="inline w-3.5 h-3.5 mr-1" />Who is this for?</label>
                    <div className="grid grid-cols-4 gap-2">
                      {RELATIONS.map((r) => (
                        <button key={r} type="button" onClick={() => { setRelation(r); setDependentId(null); }}
                          className={cn("py-2 rounded-xl border text-xs font-semibold", relation === r ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                          {r}
                        </button>
                      ))}
                    </div>
                    {relation !== "Self" && (
                      <div className="mt-3"><DependentPicker key={relation} relation={relation} selectedId={dependentId} onSelect={setDependentId} /></div>
                    )}
                  </div>

                  <div>
                    <label className="input-label"><CalendarClock className="inline w-3.5 h-3.5 mr-1" />When?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["NOW", "LATER"] as const).map((w) => {
                        const off = w === "NOW" && !canComeNow(nurse);
                        return (
                          <button key={w} type="button" disabled={off} onClick={() => { setWhen(w); setError(""); }}
                            className={cn("py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed", when === w ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                            {w === "NOW" ? "As soon as possible" : "Pick a time"}
                          </button>
                        );
                      })}
                    </div>
                    {when === "LATER" && (
                      <input type="datetime-local" className="input-field mt-2" min={localInputValue(new Date())} value={scheduledAt} onChange={(e) => { setScheduledAt(e.target.value); setError(""); }} />
                    )}
                    <p className="text-[11px] text-slate-400 mt-1">
                      Works {formatAvailability(nurse.availability)}
                      {!isDoctorAvailableNow(nurse.availability)
                        ? " — not working right now, so pick a time"
                        : nurse.busyNow ? " — on another visit right now, so pick a later time" : ""}
                    </p>
                  </div>

                  <div>
                    <label className="input-label">How many visits?</label>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                      {PACKAGE_VISIT_OPTIONS.map((n) => (
                        <button key={n} type="button" onClick={() => { setVisits(n); setError(""); }}
                          className={cn("py-2 rounded-xl border text-sm font-semibold", visits === n ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                          {n}
                        </button>
                      ))}
                    </div>
                    {visits > 1 && (
                      <>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {PACKAGE_INTERVAL_OPTIONS.map((n) => (
                            <button key={n} type="button" onClick={() => { setIntervalDays(n); setError(""); }}
                              className={cn("py-2 rounded-xl border text-xs font-semibold", intervalDays === n ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                              {intervalLabel(n)}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <p className="text-xs font-semibold text-slate-700 mb-1.5">Your {visits} visits{when === "NOW" ? " (first one as soon as possible)" : ""}</p>
                          <ol className="text-xs text-slate-600 space-y-0.5 list-decimal list-inside">
                            {schedulePreview.map((d, i) => <li key={i}>{i === 0 && when === "NOW" ? "As soon as possible" : fmtDay(d)}</li>)}
                          </ol>
                          <p className="text-[11px] text-slate-400 mt-1.5">Days {formatProviderName(nurse.name, "NURSE")} doesn&apos;t work are skipped. Pay once for all visits after she accepts.</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="input-label"><MapPin className="inline w-3.5 h-3.5 mr-1" />Visit address</label>
                    <AddressAutocomplete
                      multiline
                      value={address.text}
                      onChange={(v) => setAddress((a) => ({ ...a, text: v }))}
                      onSelect={(s) => setAddress((a) => ({ ...a, text: s.label, lat: s.lat, lng: s.lon }))}
                      placeholder="House no., building, street, area"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Saved to your profile for next time.</p>
                  </div>

                  {referral && referral.service.id === service.id && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Prescription from {formatProviderName(referral.doctorName, "DOCTOR")} attached</p>
                      <p className="text-xs text-emerald-700 mt-0.5">The nurse will see your doctor&apos;s prescription and instructions — nothing to upload.</p>
                    </div>
                  )}

                  {service.requiresPrescription && !(referral && referral.service.id === service.id) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5"><FileText className="w-4 h-4" />Doctor&apos;s prescription (required)</p>
                      <p className="text-xs text-amber-700 mt-0.5 mb-2">Nurses can only give {service.name.toLowerCase()} that a doctor has prescribed.</p>
                      {docs.length > 0 && (
                        <select className="input-field mb-2" value={prescriptionDocId} onChange={(e) => { setPrescriptionDocId(e.target.value); setError(""); }}>
                          <option value="">Choose from your health documents…</option>
                          {docs.map((d) => <option key={d.id} value={d.id}>{d.title} ({d.category})</option>)}
                        </select>
                      )}
                      <label className={cn("btn-secondary py-2 px-3 text-xs cursor-pointer inline-flex", uploadingRx && "opacity-60 pointer-events-none")}>
                        {uploadingRx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload prescription
                        <input type="file" className="hidden" accept="application/pdf,image/jpeg,image/png"
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadPrescription(f); }} />
                      </label>
                      {prescriptionDocId && <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Prescription attached</p>}
                    </div>
                  )}

                  <div>
                    <label className="input-label">Anything the nurse should know? (optional)</label>
                    <textarea rows={2} className="input-field" placeholder="e.g. Injection name & dose, wound location, patient is bedridden…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-slate-600">
                    <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(""); }} className="w-4 h-4 mt-0.5 accent-blue-500 flex-shrink-0" />
                    I confirm the details are accurate and consent to this nurse visiting my home and accessing the relevant medical details for this visit.
                  </label>

                  {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-start gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}</div>}

                  <button type="submit" disabled={booking} className="btn-primary w-full justify-center py-3.5 text-base">
                    {visits > 1 ? `Request ${visits} visits (₹${total})` : `Request visit (₹${nurse.price})`}
                  </button>
                  <p className="text-[11px] text-slate-400 text-center">You pay online after the nurse accepts.</p>
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
          title="Confirm this visit?"
          message={
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3"><span>Nurse</span><span className="font-semibold text-slate-800 text-right">{formatProviderName(nurse.name, "NURSE")}</span></div>
              <div className="flex justify-between gap-3"><span>Service</span><span className="font-semibold text-slate-800 text-right">{service.name}</span></div>
              {visits > 1 && (
                <div className="flex justify-between gap-3"><span>Visits</span><span className="font-semibold text-slate-800 text-right">{visits} · {intervalLabel(intervalDays)} · ₹{nurse.price} each</span></div>
              )}
              <div className="flex justify-between gap-3"><span>{visits > 1 ? "First visit" : "When"}</span><span className="font-semibold text-slate-800 text-right">{when === "LATER" && scheduledAt ? new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "As soon as possible"}</span></div>
              <div className="flex justify-between gap-3"><span>Payment</span><span className="font-semibold text-slate-800 text-right">Online, after the nurse accepts</span></div>
            </div>
          }
          confirmLabel={`Confirm (₹${total})`}
          busyLabel="Booking…"
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
