"use client";
import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MapPin, Home, Building2, Video, Stethoscope, Clock,
  ChevronDown, X, Loader2, CheckCircle, LogOut, Languages,
  Navigation, AlertCircle, IndianRupee, CalendarClock, Siren,
  CalendarCheck2, Wallet, CreditCard, AlertTriangle, ShieldCheck, Users, Search,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useSpecialties } from "@/lib/useSpecialties";
import { isDoctorAvailableNow } from "@/lib/availability";
import { estimateArrivalMinutes } from "@/lib/eta";
import { RELATIONS } from "@/lib/relations";
import RatingStars from "@/components/patient/RatingStars";
import VerifiedBadge from "@/components/patient/VerifiedBadge";
import SpecialtyFilter from "@/components/patient/SpecialtyFilter";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import { computeCompleteness } from "@/lib/profileCompleteness";

// ── Types ──────────────────────────────────────────────────────────────────
interface DoctorProfile {
  specialty: string;
  experience: number;
  consultFee: number;
  videoFee: number;
  homeVisitFee: number;
  availability: string;
  radius: number;
  lat: number | null;
  lng: number | null;
  qualification: string;
  languages: string;
  bio: string | null;
  isVerified: boolean;
  offersHomeVisit: boolean;
  avgRating: number;
  totalReviews: number;
}

interface Doctor {
  id: string;
  name: string;
  doctorProfile: DoctorProfile | null;
  distance?: number; // km, computed client-side
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  patient: { name: string };
}

// ── Haversine distance (km) ────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── SVG pin creator ────────────────────────────────────────────────────────
function makePinSvg(color: string, pulse = false) {
  const outer = pulse
    ? `<circle cx="16" cy="16" r="15" fill="${color}" opacity="0.2"><animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite"/></circle>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    ${outer}
    <path d="M16 0C7.16 0 0 7.16 0 16c0 10 16 24 16 24s16-14 16-24C32 7.16 24.84 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="7" fill="white" opacity="0.9"/>
    <path d="M16 10v6l4 2" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
}

// ── CONSULT TYPE OPTIONS ───────────────────────────────────────────────────
const ALL_TYPES = [
  { id: "HOME", label: "Home Visit", icon: Home, comingSoon: false },
  { id: "CLINIC", label: "Clinic Visit", icon: Building2, comingSoon: false },
  { id: "VIDEO", label: "Video Call", icon: Video, comingSoon: true },
];

function feeForConsultType(profile: DoctorProfile | null | undefined, consultType: string): number {
  if (!profile) return 0;
  if (consultType === "HOME") return profile.homeVisitFee;
  if (consultType === "VIDEO") return profile.videoFee;
  return profile.consultFee;
}

// Local datetime-local min value (now, floored to the minute)
function nowLocalInput() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

// ══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════
function PatientDashboardInner() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { specialties, colorFor } = useSpecialties();

  // State
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [posError, setPosError] = useState(false);
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [consultType, setConsultType] = useState("HOME");
  const [symptoms, setSymptoms] = useState("");
  const [allergies, setAllergies] = useState("");
  const [relation, setRelation] = useState("Self");
  const [patientName, setPatientName] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"NOW" | "LATER">("NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "CASH">("CASH");
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<{ id: string; fee: number; paymentMethod: string } | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyText, setEmergencyText] = useState("");
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [emergencyResult, setEmergencyResult] = useState<{ doctorName: string; eta: number } | null>(null);
  const followUpOfId = searchParams.get("followUpOf");
  const deepLinkedDoctorId = searchParams.get("doctorId");
  const didDeepLink = useRef(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());

  // ── Get user geolocation ───────────────────────────────────────────────
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {
        setPosError(true);
        setUserPos([18.5204, 73.8567]); // Pune fallback
      },
      { timeout: 8000 }
    );
  }, []);

  // ── Fetch doctors ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/doctors")
      .then((r) => r.json())
      .then((data: Doctor[]) => setDoctors(data));
  }, []);

  // Re-checks who's currently within their set hours every minute, so a
  // doctor's pin appears/disappears live as their availability window
  // opens or closes without the patient needing to reload the map.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Deep link: open a specific doctor's panel (follow-up bookings) ──────
  useEffect(() => {
    if (didDeepLink.current || !deepLinkedDoctorId || doctors.length === 0) return;
    const doc = doctors.find((d) => d.id === deepLinkedDoctorId);
    if (doc) {
      didDeepLink.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDoctor(doc);
      setPanelOpen(true);
    }
  }, [doctors, deepLinkedDoctorId]);

  // ── Compute distances whenever userPos or doctors change ───────────────
  const doctorsWithDist = useMemo(() => doctors.map((d) => {
    if (!d.doctorProfile?.lat || !d.doctorProfile?.lng || !userPos) return d;
    return {
      ...d,
      distance: haversine(
        userPos[0],
        userPos[1],
        d.doctorProfile.lat,
        d.doctorProfile.lng
      ),
    };
  }), [doctors, userPos]);

  const filteredDoctors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctorsWithDist.filter((d) => {
      const matchesSpecialty = !specialtyFilter || d.doctorProfile?.specialty === specialtyFilter;
      const matchesSearch = !q || d.name.toLowerCase().includes(q) || (d.doctorProfile?.specialty ?? "").toLowerCase().includes(q);
      const isOpenNow = isDoctorAvailableNow(d.doctorProfile?.availability, new Date(now));
      return matchesSpecialty && matchesSearch && isOpenNow;
    });
  }, [doctorsWithDist, specialtyFilter, search, now]);

  const sorted = useMemo(() => [...filteredDoctors].sort(
    (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
  ), [filteredDoctors]);
  const nearest = sorted[0];

  // Nearest doctor regardless of specialty filter — used for emergency requests
  const nearestAny = useMemo(() => [...doctorsWithDist].sort(
    (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
  )[0], [doctorsWithDist]);

  // ── Initialise Leaflet once map div is available ───────────────────────
  const initMap = useCallback(
    async (center: [number, number]) => {
      if (!mapRef.current || leafletMapRef.current) return;
      const L = (await import("leaflet")).default;

      // Fix default icon path issue with bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, {
        center,
        zoom: 14,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "© OpenStreetMap contributors", maxZoom: 19 }
      ).addTo(map);

      leafletMapRef.current = map;
    },
    []
  );

  // ── Place / update markers ─────────────────────────────────────────────
  const placeDoctorMarkers = useCallback(async () => {
    if (!leafletMapRef.current) return;
    const L = (await import("leaflet")).default;
    const map = leafletMapRef.current;
    const docList = filteredDoctors;
    const nearestId = nearest?.id;
    const visibleIds = new Set(docList.map((d) => d.id));

    // Remove markers for doctors no longer in the filtered list
    markersRef.current.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    docList.forEach((doc) => {
      if (!doc.doctorProfile?.lat || !doc.doctorProfile?.lng) return;
      const color = colorFor(doc.doctorProfile.specialty);
      const isNearest = doc.id === nearestId;
      const svgStr = makePinSvg(color, isNearest);
      const icon = L.divIcon({
        html: svgStr,
        className: "",
        iconSize: [32, 40],
        iconAnchor: [16, 40],
        popupAnchor: [0, -44],
      });

      if (markersRef.current.has(doc.id)) {
        // update icon only
        markersRef.current.get(doc.id)!.setIcon(icon);
        return;
      }

      const marker = L.marker([doc.doctorProfile.lat, doc.doctorProfile.lng], { icon })
        .addTo(map)
        .on("click", () => {
          setSelectedDoctor(doc);
          setPanelOpen(true);
          setBookingOpen(false);
          setConsultType(doc.doctorProfile?.offersHomeVisit ? "HOME" : "CLINIC");
          setSymptoms("");
          setRelation("Self");
          setPatientName("");
          setConsentGiven(false);
          setBooked(null);
          setScheduleMode("NOW");
          setPaymentMethod("CASH");
        });

      markersRef.current.set(doc.id, marker);
    });
  }, [filteredDoctors, nearest?.id, colorFor]);

  // ── Add user position circle ───────────────────────────────────────────
  const addUserCircle = useCallback(async (pos: [number, number]) => {
    if (!leafletMapRef.current) return;
    const L = (await import("leaflet")).default;
    const map = leafletMapRef.current;

    // Blue dot for user
    const userIcon = L.divIcon({
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,0.25)"></div>`,
      className: "",
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    L.marker(pos, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    L.circle(pos, { radius: 300, color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.06, weight: 1.5 }).addTo(map);
  }, []);

  // ── Boot sequence: wait for userPos then init map ──────────────────────
  useEffect(() => {
    if (!userPos) return;
    // requestAnimationFrame ensures React has committed the map <div> to the
    // DOM before Leaflet tries to find it (avoids "Map container not found")
    const raf = requestAnimationFrame(async () => {
      await initMap(userPos);
      await addUserCircle(userPos);
      await placeDoctorMarkers();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos]);

  // ── Re-place markers when doctors list or specialty filter changes ─────
  useEffect(() => {
    if (!leafletMapRef.current) return;
    placeDoctorMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors, specialtyFilter, search, now]);

  // ── Fly to selected doctor ─────────────────────────────────────────────
  useEffect(() => {
    const lat = selectedDoctor?.doctorProfile?.lat;
    const lng = selectedDoctor?.doctorProfile?.lng;
    if (!lat || !lng || !leafletMapRef.current) return;
    leafletMapRef.current.flyTo(
      [lat, lng],
      15,
      { duration: 0.8 }
    );
  }, [selectedDoctor]);

  // ── Fetch reviews when a doctor's panel opens ───────────────────────────
  useEffect(() => {
    if (!panelOpen || !selectedDoctor) return;
    fetch(`/api/doctors/${selectedDoctor.id}/reviews`)
      .then((r) => r.json())
      .then(setReviews)
      .catch(() => setReviews([]));
  }, [panelOpen, selectedDoctor]);

  // ── Redirect unauthenticated ───────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
    if (!authLoading && user && user.role !== "PATIENT") router.push("/login");
  }, [authLoading, user, router]);

  // ── Nudge to complete profile once per session ──────────────────────────
  const [profilePercent, setProfilePercent] = useState<number | null>(null);
  useEffect(() => {
    if (!user || user.role !== "PATIENT") return;
    fetch("/api/patients/me")
      .then((r) => r.json())
      .then((d) => {
        const { percent } = computeCompleteness(d.patientProfile);
        setProfilePercent(percent);
        if (d.patientProfile?.allergies) setAllergies(d.patientProfile.allergies);
        if (percent < 100 && !sessionStorage.getItem("profilePromptSeen")) {
          sessionStorage.setItem("profilePromptSeen", "1");
          router.replace("/patient/profile");
        }
      })
      .catch(() => {});
  }, [user, router]);

  // ── Booking submit ─────────────────────────────────────────────────────
  const submitBooking = async () => {
    if (!user?.id || !selectedDoctor || !consentGiven) return;
    setBooking(true);
    const fee = feeForConsultType(selectedDoctor.doctorProfile, consultType);

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doctorId: selectedDoctor.id,
        symptoms,
        patientName,
        relation,
        allergies,
        consentGiven,
        consultType,
        amount: fee,
        paymentMethod,
        followUpOfId: followUpOfId ?? undefined,
        ...(scheduleMode === "LATER" && scheduledAt
          ? { scheduledAt: new Date(scheduledAt).toISOString() }
          : {}),
      }),
    });
    const data = await res.json();
    setBooking(false);
    if (res.ok) setBooked({ id: data.id, fee, paymentMethod });
  };

  // ── Emergency quick-book ────────────────────────────────────────────────
  const submitEmergency = async () => {
    if (!user?.id || !nearestAny) return;
    setEmergencyBusy(true);
    const type = nearestAny.doctorProfile?.offersHomeVisit ? "HOME" : "CLINIC";
    const fee = feeForConsultType(nearestAny.doctorProfile, type);

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doctorId: nearestAny.id,
        symptoms: emergencyText || "Emergency request",
        consultType: type,
        amount: fee,
        paymentMethod: "CASH",
        isEmergency: true,
      }),
    });
    setEmergencyBusy(false);
    if (res.ok) {
      setEmergencyResult({
        doctorName: nearestAny.name,
        eta: estimateArrivalMinutes(nearestAny.distance ?? 0),
      });
    }
  };

  const fee = feeForConsultType(selectedDoctor?.doctorProfile, consultType);

  const eta = selectedDoctor?.distance != null ? estimateArrivalMinutes(selectedDoctor.distance) : null;
  const availableTypes = ALL_TYPES.filter(
    (t) => t.id !== "HOME" || selectedDoctor?.doctorProfile?.offersHomeVisit !== false
  );

  // ── Derived loading flag ───────────────────────────────────────────────
  const isLoading = authLoading || !userPos;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900">
      {/* ── Leaflet CSS ─────────────────────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />

      {/* ── Map container (always mounted so Leaflet can find it) ──────── */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* ── Loading overlay (shown until map + location are ready) ──────── */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gradient-surface gap-4">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-xl animate-pulse-glow">
            <MapPin className="w-7 h-7 text-white" />
          </div>
          <p className="text-slate-500 text-sm animate-pulse">
            {authLoading ? "Checking session…" : "Finding your location…"}
          </p>
        </div>
      )}

      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div className="absolute top-0 inset-x-0 z-20 pointer-events-none">
        <div className="flex items-start justify-between p-3 sm:p-4 gap-2 sm:gap-3">
          {/* Logo / title */}
          <div className="glass-card rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2.5 sm:gap-3 pointer-events-auto shadow-lg min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl gradient-primary flex items-center justify-center shadow flex-shrink-0">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0 hidden xs:block sm:block">
              <p className="text-sm font-bold text-slate-900 leading-none">DocOnClick</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {posError ? "📍 Default" : "📍 Your location"}
              </p>
            </div>
          </div>

          {/* Right: profile + appointments + user + logout */}
          <div className="glass-card rounded-2xl px-2.5 sm:px-4 py-2.5 sm:py-3 flex items-center gap-1.5 sm:gap-3 pointer-events-auto shadow-lg flex-shrink-0">
            {profilePercent != null && profilePercent < 100 && (
              <button
                onClick={() => router.push("/patient/profile")}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
                title="Complete your profile"
              >
                Profile {profilePercent}%
              </button>
            )}
            <button
              onClick={() => router.push("/patient/appointments")}
              className="hidden sm:flex w-8 h-8 rounded-xl bg-blue-50 items-center justify-center text-blue-500 hover:bg-blue-100 transition-colors"
              title="My Appointments"
            >
              <CalendarCheck2 className="w-4 h-4" />
            </button>
            <div className="text-right hidden md:block">
              <p className="text-xs font-semibold text-slate-900 leading-none">{user?.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">Patient</p>
            </div>
            <button
              onClick={logout}
              className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search + specialty filter chips */}
        <div className="px-3 sm:px-4 pointer-events-auto">
          <div className="glass-card rounded-2xl p-2.5 max-w-full">
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search doctor or specialty…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-xl border border-slate-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <SpecialtyFilter value={specialtyFilter} onChange={setSpecialtyFilter} />
          </div>
        </div>

        {/* Nearest doctor badge + emergency button, same row so they never collide */}
        <div className="flex items-center gap-2 px-3 sm:px-4 mt-2.5">
          {nearest?.doctorProfile && (
            <button
              onClick={() => {
                setSelectedDoctor(nearest);
                setPanelOpen(true);
                setBookingOpen(false);
                setConsultType(nearest.doctorProfile?.offersHomeVisit ? "HOME" : "CLINIC");
              }}
              className="glass-card rounded-2xl pl-3 pr-3 py-2.5 flex items-center gap-2 pointer-events-auto shadow-lg hover:scale-[1.02] transition-transform min-w-0 flex-1 sm:flex-initial"
            >
              <div
                className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
                style={{ backgroundColor: colorFor(nearest.doctorProfile.specialty) }}
              />
              <span className="text-xs font-semibold text-slate-700 truncate min-w-0">
                Nearest: <span className="text-blue-600">{nearest.name}</span>
                {nearest.distance != null && (
                  <span className="text-slate-400 font-normal ml-1">
                    · {nearest.distance.toFixed(1)} km
                  </span>
                )}
              </span>
              <Navigation className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            </button>
          )}
          <div className="ml-auto pointer-events-auto flex-shrink-0">
        <button
          onClick={() => { setEmergencyOpen(true); setEmergencyText(""); setEmergencyResult(null); }}
          className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl text-white transition-colors"
          title="Emergency request"
          style={{ boxShadow: "0 0 0 6px rgba(239,68,68,0.18)" }}
        >
          <Siren className="w-5 h-5" />
        </button>
          </div>
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────── */}
      <div className="hidden sm:block absolute bottom-6 left-4 z-20 pointer-events-none">
        <div className="glass-card rounded-2xl p-3 flex flex-col gap-1.5 max-w-[170px]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Specialties</p>
          {specialties.slice(0, 5).map(({ name, color }) => (
            <div key={name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-slate-600 leading-none">{name}</span>
            </div>
          ))}
          <p className="text-[9px] text-slate-400 mt-1">Tap a pin to book</p>
        </div>
      </div>

      {/* ── Doctor count badge ──────────────────────────────────────── */}
      <div className="absolute bottom-20 sm:bottom-6 right-4 z-20 pointer-events-none">
        <div className="glass-card rounded-2xl px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 pointer-events-auto">
          <Stethoscope className="w-4 h-4 text-blue-500" />
          <span className="text-xs sm:text-sm font-semibold text-slate-700">
            {filteredDoctors.filter((d) => d.doctorProfile?.lat).length} doctors nearby
          </span>
        </div>
      </div>

      <PatientMobileNav />

      {/* ══════════════════════════════════════════════════════════════
          SLIDE-UP DOCTOR PANEL
      ══════════════════════════════════════════════════════════════ */}
      {panelOpen && selectedDoctor?.doctorProfile && (
        <>
          {/* Backdrop */}
          <div
            className="absolute inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
            onClick={() => { setPanelOpen(false); setBookingOpen(false); }}
          />

          {/* Panel */}
          <div
            className="absolute bottom-0 inset-x-0 z-40 rounded-t-3xl overflow-hidden max-h-[85vh] overflow-y-auto"
            style={{
              background: "rgba(255,255,255,0.97)",
              backdropFilter: "blur(24px)",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
              animation: "slideUp 0.35s cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-slate-200" />
            </div>

            {/* Close */}
            <button
              onClick={() => { setPanelOpen(false); setBookingOpen(false); }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="px-5 pb-2">
              {/* ── BOOKING CONFIRMATION STATE ─────────────────────── */}
              {booked ? (
                <div className="py-8 flex flex-col items-center text-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                    <Clock className="w-9 h-9 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900">Request Sent!</h3>
                    <p className="text-slate-500 text-sm mt-1">
                      Waiting for {selectedDoctor.name} to confirm your {consultType === "HOME" ? "home visit" : "appointment"}.
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-2">ID: {booked.id.slice(0, 14)}…</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 w-full">
                    You&apos;ll be notified once accepted{booked.paymentMethod === "ONLINE" ? " — pay online from My Appointments after that" : ""}.
                  </div>
                  <button
                    onClick={() => router.push("/patient/appointments")}
                    className="btn-secondary w-full justify-center py-3"
                  >
                    View My Appointments
                  </button>
                </div>
              ) : bookingOpen ? (
                /* ── BOOKING FORM ──────────────────────────────────── */
                <div className="pb-6">
                  <h3 className="text-lg font-extrabold text-slate-900 mb-1">Confirm Booking</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    {selectedDoctor.name} · {selectedDoctor.doctorProfile.specialty}
                  </p>

                  {/* Consult type */}
                  <div className={`grid gap-2 mb-4 ${availableTypes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                    {availableTypes.map(({ id, label, icon: Icon, comingSoon }) => (
                      <button
                        key={id}
                        type="button"
                        disabled={comingSoon}
                        onClick={() => setConsultType(id)}
                        className={`relative flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all ${
                          comingSoon
                            ? "border-slate-100 text-slate-300 cursor-not-allowed"
                            : consultType === id
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        {comingSoon && (
                          <span className="absolute -top-2 -right-1.5 badge badge-gray text-[9px] px-1.5 py-0.5">Soon</span>
                        )}
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Fee + ETA pill */}
                  <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-2.5 mb-4 flex-wrap">
                    <IndianRupee className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-700">{fee}</span>
                    <span className="text-xs text-blue-500">
                      {consultType === "HOME" ? "Home visit fee" : consultType === "CLINIC" ? "Clinic fee" : "Video fee"}
                    </span>
                    {consultType === "HOME" && eta != null && (
                      <span className="text-xs text-blue-600 font-semibold ml-auto flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Arrives in ~{eta} min
                      </span>
                    )}
                  </div>

                  {/* Now vs Schedule later */}
                  <label className="input-label mb-2 block">When?</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button type="button" onClick={() => setScheduleMode("NOW")}
                      className={`py-2.5 rounded-xl border text-xs font-semibold transition-all ${scheduleMode === "NOW" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>
                      Book Now
                    </button>
                    <button type="button" onClick={() => setScheduleMode("LATER")}
                      className={`py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${scheduleMode === "LATER" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>
                      <CalendarClock className="w-3.5 h-3.5" /> Schedule Later
                    </button>
                  </div>
                  {scheduleMode === "LATER" && (
                    <input
                      type="datetime-local"
                      className="input-field mb-4"
                      min={nowLocalInput()}
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                    />
                  )}

                  {/* Payment method */}
                  <label className="input-label mb-2 block">Payment</label>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button type="button" onClick={() => setPaymentMethod("CASH")}
                      className={`py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${paymentMethod === "CASH" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>
                      <Wallet className="w-3.5 h-3.5" /> Pay Cash
                    </button>
                    <button type="button" onClick={() => setPaymentMethod("ONLINE")}
                      className={`py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${paymentMethod === "ONLINE" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>
                      <CreditCard className="w-3.5 h-3.5" /> Pay Online
                    </button>
                  </div>

                  {/* Who is this for */}
                  <label className="input-label"><Users className="inline w-3.5 h-3.5 mr-1" />Who is this for?</label>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {RELATIONS.map((r) => (
                      <button key={r} type="button" onClick={() => setRelation(r)}
                        className={`py-2 rounded-xl border text-xs font-semibold transition-all ${relation === r ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  {relation !== "Self" && (
                    <input className="input-field mb-4" placeholder={`${relation}'s full name`}
                      value={patientName} onChange={(e) => setPatientName(e.target.value)} />
                  )}

                  {/* Symptoms */}
                  <label className="input-label">Symptoms / Reason</label>
                  <textarea
                    rows={3}
                    className="input-field resize-none mb-4"
                    placeholder="Describe your symptoms briefly…"
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                  />

                  {/* Allergies */}
                  <label className="input-label"><AlertTriangle className="inline w-3.5 h-3.5 mr-1 text-amber-500" />Any Known Allergies?</label>
                  <textarea
                    rows={2}
                    className="input-field resize-none mb-4"
                    placeholder="e.g. Penicillin, Sulfa drugs — leave blank if none"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                  />

                  {/* Consent */}
                  <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-4 py-3 mb-4 cursor-pointer">
                    <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-blue-500 flex-shrink-0" />
                    <span className="text-xs text-slate-600 flex items-start gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                      I confirm the information above is accurate and I consent to this doctor accessing my medical profile and treating me for this consultation.
                    </span>
                  </label>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setBookingOpen(false)}
                      className="btn-secondary flex-1 justify-center py-3"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitBooking}
                      disabled={booking || !symptoms.trim() || !consentGiven || (scheduleMode === "LATER" && !scheduledAt) || (relation !== "Self" && !patientName.trim())}
                      className="btn-primary flex-1 justify-center py-3"
                    >
                      {booking ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</> : `Confirm ₹${fee}`}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── DOCTOR PROFILE CARD ───────────────────────────── */
                <div className="pb-6">
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-5">
                    {/* Avatar */}
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-white text-xl font-extrabold shadow"
                      style={{ background: `linear-gradient(135deg, ${colorFor(selectedDoctor.doctorProfile.specialty)}, ${colorFor(selectedDoctor.doctorProfile.specialty)}99)` }}
                    >
                      {selectedDoctor.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-extrabold text-slate-900 leading-tight">{selectedDoctor.name}</h3>
                        {selectedDoctor.doctorProfile.isVerified && <VerifiedBadge />}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{selectedDoctor.doctorProfile.specialty}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{selectedDoctor.doctorProfile.qualification}</p>
                      <div className="mt-1.5">
                        <RatingStars
                          avgRating={selectedDoctor.doctorProfile.avgRating}
                          totalReviews={selectedDoctor.doctorProfile.totalReviews}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Chips row */}
                  <div className="flex flex-wrap gap-2 mb-5">
                    <span className="badge badge-info">{selectedDoctor.doctorProfile.experience} yrs exp</span>
                    {selectedDoctor.distance != null && (
                      <span className="badge badge-success">
                        <Navigation className="w-3 h-3" /> {selectedDoctor.distance.toFixed(1)} km
                      </span>
                    )}
                    <span className="badge badge-gray">
                      <Clock className="w-3 h-3" /> {selectedDoctor.doctorProfile.availability}
                    </span>
                    <span className="badge badge-purple">
                      <Languages className="w-3 h-3" /> {selectedDoctor.doctorProfile.languages}
                    </span>
                  </div>

                  {selectedDoctor.doctorProfile.bio && (
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3.5 mb-5 leading-relaxed">
                      {selectedDoctor.doctorProfile.bio}
                    </p>
                  )}

                  {/* Fee cards */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                      <Building2 className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                      <p className="text-xs text-slate-500">Clinic Visit</p>
                      <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{selectedDoctor.doctorProfile.consultFee}</p>
                    </div>
                    <div className="relative rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center opacity-60">
                      <span className="absolute -top-2 -right-1.5 badge badge-gray text-[9px] px-1.5 py-0.5">Soon</span>
                      <Video className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-500">Video Call</p>
                      <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{selectedDoctor.doctorProfile.videoFee}</p>
                    </div>
                    {selectedDoctor.doctorProfile.offersHomeVisit ? (
                      <div className="rounded-2xl p-4 border border-blue-200 bg-blue-50 text-center">
                        <Home className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                        <p className="text-xs text-blue-600">Home Visit</p>
                        <p className="text-base font-extrabold text-blue-700 mt-0.5">₹{selectedDoctor.doctorProfile.homeVisitFee}</p>
                        {selectedDoctor.distance != null && (
                          <p className="text-[10px] text-blue-500 mt-0.5">~{estimateArrivalMinutes(selectedDoctor.distance)} min arrival</p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center flex flex-col items-center justify-center">
                        <Home className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                        <p className="text-xs text-slate-400">Home visit not offered</p>
                      </div>
                    )}
                  </div>

                  {/* Reviews */}
                  {reviews.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recent Reviews</p>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {reviews.slice(0, 4).map((r) => (
                          <div key={r.id} className="bg-slate-50 rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2">
                              <RatingStars avgRating={r.rating} totalReviews={1} />
                            </div>
                            {r.comment && <p className="text-xs text-slate-600 mt-1">&ldquo;{r.comment}&rdquo;</p>}
                            <p className="text-[10px] text-slate-400 mt-0.5">{r.patient.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CTA buttons */}
                  {selectedDoctor.doctorProfile.offersHomeVisit && (
                    <button
                      onClick={() => { setConsultType("HOME"); setBookingOpen(true); }}
                      className="btn-primary w-full justify-center py-3.5 text-base mb-2.5"
                    >
                      <Home className="w-4 h-4" /> Request Home Visit
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setConsultType("CLINIC"); setBookingOpen(true); }}
                      className="btn-secondary justify-center py-3 text-sm"
                    >
                      <Building2 className="w-4 h-4" /> Clinic Visit
                    </button>
                    <button
                      disabled
                      title="Video calling is coming soon"
                      className="relative btn-secondary justify-center py-3 text-sm opacity-50 cursor-not-allowed"
                    >
                      <span className="absolute -top-2 -right-1.5 badge badge-gray text-[9px] px-1.5 py-0.5">Soon</span>
                      <Video className="w-4 h-4" /> Video Call
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          EMERGENCY MODAL
      ══════════════════════════════════════════════════════════════ */}
      {emergencyOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            {emergencyResult ? (
              <div className="text-center py-2">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 mb-1">Request Sent</h3>
                <p className="text-sm text-slate-500 mb-4">
                  {emergencyResult.doctorName} has been notified and flagged as urgent — waiting for them to accept. Estimated arrival once accepted: ~{emergencyResult.eta} min. Pay cash on visit.
                </p>
                <button onClick={() => setEmergencyOpen(false)} className="btn-primary w-full justify-center py-3">Close</button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Siren className="w-5 h-5 text-red-500" />
                  <h3 className="text-lg font-extrabold text-slate-900">Emergency Request</h3>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  This is not an ambulance service. We&apos;ll immediately notify the nearest available doctor
                  {nearestAny ? <> — <strong>{nearestAny.name}</strong> ({nearestAny.distance?.toFixed(1)} km away)</> : null}.
                </p>
                <textarea
                  rows={3}
                  className="input-field resize-none mb-4"
                  placeholder="Briefly describe what's happening…"
                  value={emergencyText}
                  onChange={(e) => setEmergencyText(e.target.value)}
                />
                <div className="flex gap-3">
                  <button onClick={() => setEmergencyOpen(false)} className="btn-secondary flex-1 justify-center py-3">Cancel</button>
                  <button
                    onClick={submitEmergency}
                    disabled={emergencyBusy || !nearestAny}
                    className="flex-1 justify-center py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    {emergencyBusy ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : "Request Now"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tap hint (shown when no panel is open) ──────────────────── */}
      {!panelOpen && !emergencyOpen && doctors.length > 0 && (
        <div className="absolute bottom-24 inset-x-0 z-20 flex justify-center pointer-events-none">
          <div className="glass-card rounded-full px-4 py-2 flex items-center gap-2 text-xs text-slate-500 shadow">
            <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            Tap a doctor pin to see details
          </div>
        </div>
      )}

      {/* ── Location error banner ───────────────────────────────────── */}
      {posError && (
        <div className="absolute top-44 inset-x-0 z-20 flex justify-center pointer-events-none">
          <div className="glass-card rounded-xl px-4 py-2 flex items-center gap-2 text-xs text-amber-700 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            Location access denied — showing default area (Pune)
          </div>
        </div>
      )}

      {/* ── Slide-up keyframe ───────────────────────────────────────── */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function PatientDashboard() {
  return (
    <Suspense fallback={
      <div className="w-screen h-screen flex items-center justify-center gradient-surface">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    }>
      <PatientDashboardInner />
    </Suspense>
  );
}
