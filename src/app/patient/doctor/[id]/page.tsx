"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2, Building2, Video, Home, Clock, Languages, UserX, Bookmark, BookmarkCheck, Compass, X,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn, formatDoctorName } from "@/lib/utils";
import { useSpecialties } from "@/lib/useSpecialties";
import { isClinicOpenNow, findNextOpening, formatSlotTime } from "@/lib/clinicAvailability";
import { haversine, withinSearchRadius } from "@/lib/geo";
import { getCurrentPositionCompat } from "@/lib/platform";
import { readPatientLocation } from "@/lib/patientLocation";
import RatingStars from "@/components/patient/RatingStars";
import VerifiedBadge from "@/components/patient/VerifiedBadge";

interface ClinicSlot {
  dayOfWeek: string;
  fromTime: string;
  toTime: string;
}

interface Clinic {
  id: string;
  name: string;
  address: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  slots: ClinicSlot[];
}

interface DoctorProfileData {
  id: string;
  name: string;
  clinics: Clinic[];
  doctorProfile: {
    photoUrl: string | null;
    clinicName: string | null;
    clinicPhotoUrl: string | null;
    qualification: string | null;
    medRegNo: string | null;
    specialty: string;
    experience: number;
    consultFee: number;
    videoFee: number;
    homeVisitFee: number;
    availability: string;
    languages: string;
    bio: string | null;
    offersHomeVisit: boolean;
    offersClinic: boolean;
    offersVideo: boolean;
    isVerified: boolean;
    avgRating: number;
    totalReviews: number;
    radius: number;
    lat: number | null;
    lng: number | null;
  } | null;
}

interface DoctorReview {
  id: string;
  rating: number;
  comment: string | null;
  patient: { name: string };
}

function Header() {
  const { user } = useAuth();
  return (
    <header className="safe-top sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo-icon.png" alt="DocOnClick" className="w-8 h-8 object-contain" />
          <span className="font-extrabold text-slate-900">DocOnClick</span>
        </Link>
        <Link href={user ? "/patient/dashboard" : "/login"} className="btn-secondary py-2 px-3.5 text-sm">
          {user ? "My Dashboard" : "Login"}
        </Link>
      </div>
    </header>
  );
}

export default function DoctorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { colorFor } = useSpecialties();
  const [doctor, setDoctor] = useState<DoctorProfileData | null | undefined>(undefined);
  const [reviews, setReviews] = useState<DoctorReview[]>([]);
  const [saved, setSaved] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [searchRadiusKm, setSearchRadiusKm] = useState<number | null>(null);
  const [rangeNoticeDismissed, setRangeNoticeDismissed] = useState(false);

  useEffect(() => {
    fetch(`/api/doctors/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDoctor);
    fetch(`/api/doctors/${id}/reviews`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setReviews);
  }, [id]);

  useEffect(() => {
    // Honour a location the patient pinned on the map (e.g. booking for a
    // relative in another city) over this device's GPS.
    const pinned = readPatientLocation();
    if (pinned) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserPos([pinned.lat, pinned.lng]);
      return;
    }
    getCurrentPositionCompat({ timeout: 8000 })
      .then((pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]))
      .catch(() => setUserPos(null));
  }, []);

  useEffect(() => {
    if (user?.role !== "PATIENT") return;
    fetch("/api/patients/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSearchRadiusKm(d?.patientProfile?.searchRadiusKm ?? null))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (user?.role !== "PATIENT") return;
    fetch("/api/patients/me/saved-doctors")
      .then((r) => (r.ok ? r.json() : { saved: [] }))
      .then((d: { saved?: { doctor: { id: string } }[] } | { doctor: { id: string } }[]) => {
        const list = Array.isArray(d) ? d : d.saved ?? [];
        setSaved(list.some((s) => s.doctor.id === id));
      });
  }, [user, id]);

  const toggleSave = async () => {
    setSavingBookmark(true);
    const nextSaved = !saved;
    setSaved(nextSaved);
    if (nextSaved) {
      await fetch("/api/patients/me/saved-doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: id }),
      });
    } else {
      await fetch(`/api/patients/me/saved-doctors/${id}`, { method: "DELETE" });
    }
    setSavingBookmark(false);
  };

  if (doctor === undefined) {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (doctor === null || !doctor.doctorProfile) {
    return (
      <div className="min-h-screen gradient-surface">
        <Header />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <UserX className="w-7 h-7 text-slate-400" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">Doctor not found</h1>
          <p className="text-sm text-slate-500">This profile link is invalid or no longer available.</p>
        </div>
      </div>
    );
  }

  const profile = doctor.doctorProfile;
  const hasOpenClinic = doctor.clinics.length === 0 || doctor.clinics.some((c) => isClinicOpenNow(c.slots));
  // Even when no clinic is open right now, a patient can still book a clinic
  // visit for an upcoming open slot — surface when that is.
  const nextClinicOpening = hasOpenClinic ? null : findNextOpening(doctor.clinics, new Date());
  const nextOpeningLabel = nextClinicOpening
    ? `${nextClinicOpening.daysAhead === 0 ? "today" : nextClinicOpening.daysAhead === 1 ? "tomorrow" : nextClinicOpening.dayOfWeek} ${formatSlotTime(nextClinicOpening.fromTime)}`
    : null;

  const homeBaseLat = profile.lat ?? doctor.clinics[0]?.lat ?? null;
  const homeBaseLng = profile.lng ?? doctor.clinics[0]?.lng ?? null;
  const distance =
    userPos && homeBaseLat != null && homeBaseLng != null
      ? haversine(userPos[0], userPos[1], homeBaseLat, homeBaseLng)
      : null;
  const hasHomeVisitReach = !(distance != null && distance > profile.radius);

  const outOfRange =
    !rangeNoticeDismissed &&
    !withinSearchRadius(distance, searchRadiusKm, profile.offersVideo);

  return (
    <div className="min-h-screen gradient-surface pb-16">
      <Header />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {outOfRange && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4 flex items-start gap-2.5 text-sm text-amber-800">
            <Compass className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              {formatDoctorName(doctor.name)} is
              {distance != null ? ` about ${distance.toFixed(0)} km away` : " outside your area"}, beyond the{" "}
              {searchRadiusKm} km search range set in your{" "}
              <Link href="/patient/profile" className="font-semibold underline">profile</Link>. You can still book.
            </div>
            <button onClick={() => setRangeNoticeDismissed(true)} aria-label="Dismiss" className="text-amber-600 hover:text-amber-800 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {(doctor.clinics.length > 0 ? doctor.clinics[0].photoUrl : profile.clinicPhotoUrl) && (
            <div className="w-full h-40 sm:h-48 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={(doctor.clinics.length > 0 ? doctor.clinics[0].photoUrl : profile.clinicPhotoUrl)!}
                alt={(doctor.clinics[0]?.name ?? profile.clinicName) ? `${doctor.clinics[0]?.name ?? profile.clinicName} — clinic photo` : "Clinic photo"}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-6 relative">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            {user?.role === "PATIENT" && (
              <button
                type="button"
                onClick={toggleSave}
                disabled={savingBookmark}
                title={saved ? "Remove from saved doctors" : "Save doctor for later"}
                className={cn(
                  "absolute top-4 right-4 sm:top-6 sm:right-6 w-9 h-9 rounded-full flex items-center justify-center shadow-sm border transition-colors",
                  saved
                    ? "bg-blue-50 border-blue-200 text-blue-600"
                    : "bg-white border-slate-200 text-slate-400 hover:text-blue-500 hover:border-blue-200"
                )}
              >
                {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
            )}
            {profile.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photoUrl}
                alt={doctor.name}
                className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 shadow"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-white text-xl font-extrabold shadow"
                style={{ background: `linear-gradient(135deg, ${colorFor(profile.specialty)}, ${colorFor(profile.specialty)}99)` }}
              >
                {doctor.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-extrabold text-slate-900 leading-tight">{formatDoctorName(doctor.name)}</h1>
                {profile.isVerified && <VerifiedBadge />}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{profile.specialty}</p>
              <p className="text-xs text-slate-400 mt-0.5">{profile.qualification}</p>
              {profile.clinicName && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3 flex-shrink-0" /> {profile.clinicName}
                </p>
              )}
              <div className="mt-1.5">
                <RatingStars avgRating={profile.avgRating} totalReviews={profile.totalReviews} />
              </div>
            </div>
          </div>

          {/* Chips */}
          <div className="flex flex-wrap gap-2 mb-5">
            <span className="badge badge-info">{profile.experience} yrs exp</span>
            <span className="badge badge-gray">
              <Clock className="w-3 h-3" /> {profile.availability}
            </span>
            <span className="badge badge-purple">
              <Languages className="w-3 h-3" /> {profile.languages}
            </span>
          </div>

          {profile.bio && (
            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3.5 mb-5 leading-relaxed">
              {profile.bio}
            </p>
          )}

          {/* Our Clinics */}
          {doctor.clinics.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Our Clinics</p>
              <div className="space-y-2">
                {doctor.clinics.map((clinic) => {
                  const open = isClinicOpenNow(clinic.slots);
                  const next = open ? null : findNextOpening([clinic], new Date());
                  return (
                    <div key={clinic.id} className="bg-slate-50 rounded-xl px-3.5 py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> {clinic.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{clinic.address}</p>
                        {next && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Opens {next.daysAhead === 0 ? "today" : next.daysAhead === 1 ? "tomorrow" : next.dayOfWeek} {formatSlotTime(next.fromTime)}
                          </p>
                        )}
                      </div>
                      <span className={cn("badge flex-shrink-0", open ? "badge-success" : "badge-gray")}>
                        {open ? "Open now" : "Closed now"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fee cards — a service the doctor doesn't offer at all is left
              out entirely rather than shown as disabled; only temporary
              unavailability (clinic closed, outside home-visit range) still
              renders a disabled card with a reason. */}
          {(() => {
            const offeredCount = [profile.offersClinic, profile.offersVideo, profile.offersHomeVisit].filter(Boolean).length;
            if (offeredCount === 0) return null;
            return (
              <div className={cn("grid gap-3 mb-6", offeredCount === 1 ? "grid-cols-1" : offeredCount === 2 ? "grid-cols-2" : "grid-cols-3")}>
                {profile.offersClinic && (
                  <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                    <Building2 className={cn("w-5 h-5 mx-auto mb-1", hasOpenClinic ? "text-blue-500" : "text-slate-400")} />
                    <p className="text-xs text-slate-500">Clinic Visit</p>
                    <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{profile.consultFee}</p>
                    {!hasOpenClinic && (
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        {nextOpeningLabel ? `Closed now · opens ${nextOpeningLabel}` : "Closed now · schedule for later"}
                      </p>
                    )}
                  </div>
                )}
                {profile.offersVideo && (
                  <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                    <Video className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                    <p className="text-xs text-slate-500">Video Consultation</p>
                    <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{profile.videoFee}</p>
                  </div>
                )}
                {profile.offersHomeVisit && (
                  hasHomeVisitReach ? (
                    <div className="rounded-2xl p-4 border border-blue-200 bg-blue-50 text-center">
                      <Home className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                      <p className="text-xs text-blue-600">Home Visit</p>
                      <p className="text-base font-extrabold text-blue-700 mt-0.5">₹{profile.homeVisitFee}</p>
                    </div>
                  ) : (
                    <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center flex flex-col items-center justify-center">
                      <Home className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Outside home visit range</p>
                    </div>
                  )
                )}
              </div>
            );
          })()}

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recent Reviews</p>
              <div className="space-y-2">
                {reviews.slice(0, 4).map((r) => (
                  <div key={r.id} className="bg-slate-50 rounded-xl px-3 py-2">
                    <RatingStars avgRating={r.rating} totalReviews={1} />
                    {r.comment && <p className="text-xs text-slate-600 mt-1">&ldquo;{r.comment}&rdquo;</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">{r.patient.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            href={
              doctor.clinics.length > 0
                ? `/patient/book?doctorId=${doctor.id}&clinicId=${
                    doctor.clinics.find((c) => isClinicOpenNow(c.slots))?.id ?? doctor.clinics[0].id
                  }`
                : `/patient/book?doctorId=${doctor.id}`
            }
            className="btn-primary w-full justify-center py-3.5 text-base"
          >
            Book Appointment
          </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
