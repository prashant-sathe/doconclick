"use client";
import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MapPin, Home, Building2, Video, Stethoscope, Clock,
  ChevronDown, X, Loader2, CheckCircle, LogOut, Languages,
  Navigation, AlertCircle, IndianRupee, CalendarClock, Siren,
  CalendarCheck2, AlertTriangle, ShieldCheck, Users, Search,
  Bookmark, BookmarkCheck, Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useSpecialties } from "@/lib/useSpecialties";
import { isDoctorAvailableNow } from "@/lib/availability";
import { isClinicOpenNow, findOpenClinic, findNextOpening, formatSlotTime } from "@/lib/clinicAvailability";
import { estimateArrivalMinutes } from "@/lib/eta";
import { RELATIONS } from "@/lib/relations";
import { haversine } from "@/lib/geo";
import { cn, formatDoctorName } from "@/lib/utils";
import RatingStars from "@/components/patient/RatingStars";
import VerifiedBadge from "@/components/patient/VerifiedBadge";
import SpecialtyFilter from "@/components/patient/SpecialtyFilter";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import EnableNotificationsPrompt from "@/components/EnableNotificationsPrompt";
import AnnouncementPopup from "@/components/AnnouncementPopup";
import DependentPicker from "@/components/patient/DependentPicker";
import { computeCompleteness } from "@/lib/profileCompleteness";

// ── Types ──────────────────────────────────────────────────────────────────
interface DoctorProfile {
  photoUrl: string | null;
  clinicName: string | null;
  clinicPhotoUrl: string | null;
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
  offersClinic: boolean;
  offersVideo: boolean;
  avgRating: number;
  totalReviews: number;
}

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
  sortOrder: number;
  slots: ClinicSlot[];
}

interface Doctor {
  id: string;
  name: string;
  doctorProfile: DoctorProfile | null;
  clinics: Clinic[];
  distance?: number; // km, computed client-side
}

interface ClinicMarker {
  doctor: Doctor;
  clinic: Clinic;
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
// ── HTML escaping for strings injected into raw marker/tooltip HTML ────────
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Square avatar marker (photo, or initial if no photo) ───────────────────
function makeAvatarMarkerHtml(opts: {
  name: string;
  photoUrl: string | null;
  color: string;
  isOpen: boolean;
  pulse?: boolean;
}) {
  const { name, photoUrl, color, isOpen, pulse } = opts;
  const bareName = name.replace(/^dr\.?\s*/i, "").trim();
  const initial = escapeHtml((bareName[0] ?? name.trim()[0] ?? "?").toUpperCase());
  const dim = isOpen ? "" : "filter:grayscale(70%);opacity:0.75;";
  const face = photoUrl
    ? `<img src="${escapeHtml(photoUrl)}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${color},${color}99);color:#fff;font-weight:800;font-size:18px;font-family:inherit;">${initial}</div>`;
  const ring = pulse
    ? `<span class="animate-pulse" style="position:absolute;inset:-6px;border-radius:16px;border:2px solid ${color};opacity:0.6;"></span>`
    : "";
  return `<div style="position:relative;width:44px;height:44px;${dim}">
    ${ring}
    <div style="width:44px;height:44px;border-radius:12px;overflow:hidden;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${face}</div>
    <div style="width:0;height:0;margin:-2px auto 0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid white;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.25));"></div>
  </div>`;
}

// ── Hover tooltip content for a clinic marker ───────────────────────────────
function makeMarkerTooltipHtml(opts: {
  doctorName: string;
  specialty: string;
  avgRating: number;
  totalReviews: number;
  clinicName: string;
  isOpen: boolean;
  distanceKm?: number;
}) {
  const { doctorName, specialty, avgRating, totalReviews, clinicName, isOpen, distanceKm } = opts;
  const statusColor = isOpen ? "#059669" : "#94a3b8";
  const statusText = isOpen ? "Open now" : "Closed";
  return `<div style="min-width:180px;padding:10px 12px;background:white;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.18);font-family:inherit;">
    <div style="font-weight:800;font-size:13px;color:#0f172a;">${escapeHtml(doctorName)}</div>
    <div style="font-size:12px;color:#475569;margin-top:1px;">${escapeHtml(specialty)}</div>
    ${totalReviews > 0
      ? `<div style="font-size:12px;color:#0f172a;margin-top:4px;">★ ${avgRating.toFixed(1)} <span style="color:#94a3b8;">(${totalReviews})</span></div>`
      : ""}
    <div style="font-size:11px;color:#64748b;margin-top:4px;">${escapeHtml(clinicName)}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
      <span style="font-size:11px;font-weight:700;color:${statusColor};">${statusText}</span>
      ${distanceKm != null ? `<span style="font-size:11px;color:#94a3b8;">${distanceKm.toFixed(1)} km</span>` : ""}
    </div>
  </div>`;
}

// ── CONSULT TYPE OPTIONS ───────────────────────────────────────────────────
const ALL_TYPES = [
  { id: "HOME", label: "Home Visit", icon: Home },
  { id: "CLINIC", label: "Clinic Visit", icon: Building2 },
  { id: "VIDEO", label: "Video Call", icon: Video },
];

function defaultConsultType(doctor: Doctor | null | undefined): string {
  const profile = doctor?.doctorProfile;
  if (!profile) return "CLINIC";
  const clinics = doctor?.clinics ?? [];
  const hasOpenClinic = clinics.length === 0 || clinics.some((c) => isClinicOpenNow(c.slots));
  const hasHomeVisitReach = !(doctor?.distance != null && profile.radius != null && doctor.distance > profile.radius);
  if (profile.offersHomeVisit && hasHomeVisitReach) return "HOME";
  if (profile.offersClinic !== false && hasOpenClinic) return "CLINIC";
  if (profile.offersVideo) return "VIDEO";
  return "CLINIC";
}

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

// "today 2:05 PM" / "tomorrow 9:00 AM" / "Mon 9:00 AM"
function formatNextOpeningText(next: { daysAhead: number; dayOfWeek: string; fromTime: string } | null): string | null {
  if (!next) return null;
  if (next.daysAhead === 0) return `today ${formatSlotTime(next.fromTime)}`;
  if (next.daysAhead === 1) return `tomorrow ${formatSlotTime(next.fromTime)}`;
  return `${next.dayOfWeek} ${formatSlotTime(next.fromTime)}`;
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
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [savedDoctorIds, setSavedDoctorIds] = useState<Set<string>>(new Set());
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [consultType, setConsultType] = useState("HOME");
  const [symptoms, setSymptoms] = useState("");
  const [allergies, setAllergies] = useState("");
  const [relation, setRelation] = useState("Self");
  const [dependentId, setDependentId] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"NOW" | "LATER">("NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<{ id: string; fee: number } | null>(null);
  const [bookingError, setBookingError] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyText, setEmergencyText] = useState("");
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [announcementsDone, setAnnouncementsDone] = useState(false);
  const [emergencyResult, setEmergencyResult] = useState<{ doctorName: string; eta: number } | null>(null);
  const [emergencyError, setEmergencyError] = useState("");
  const followUpOfId = searchParams.get("followUpOf");
  const deepLinkedDoctorId = searchParams.get("doctorId");
  const didDeepLink = useRef(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());

  // ── Get user geolocation ───────────────────────────────────────────────
  // Some mobile browsers/WebViews never invoke either getCurrentPosition
  // callback (geolocation missing, permission prompt left unanswered, etc.),
  // which used to leave userPos — and therefore the whole map — stuck at
  // null forever. A JS-level fallback timer guarantees we always fall back
  // to the Pune default instead of silently showing no markers.
  useEffect(() => {
    let settled = false;
    const fallback = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setPosError(true);
      setUserPos([18.5204, 73.8567]); // Pune fallback
    }, 8000);

    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        setPosError(true);
        setUserPos([18.5204, 73.8567]); // Pune fallback
      },
      { timeout: 8000 }
    );

    return () => window.clearTimeout(fallback);
  }, []);

  // ── Fetch doctors ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/doctors")
      .then((r) => r.json())
      .then((data: Doctor[]) => setDoctors(data));
  }, []);

  // ── Fetch this patient's bookmarked doctors, for the save toggle in the detail panel ──
  useEffect(() => {
    if (!user || user.role !== "PATIENT") return;
    fetch("/api/patients/me/saved-doctors")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { doctor: { id: string } }[]) => setSavedDoctorIds(new Set(list.map((s) => s.doctor.id))));
  }, [user]);

  const toggleSaveDoctor = async () => {
    if (!selectedDoctor) return;
    const doctorId = selectedDoctor.id;
    const isSaved = savedDoctorIds.has(doctorId);
    setSavingBookmark(true);
    setSavedDoctorIds((prev) => {
      const next = new Set(prev);
      isSaved ? next.delete(doctorId) : next.add(doctorId);
      return next;
    });
    if (isSaved) {
      await fetch(`/api/patients/me/saved-doctors/${doctorId}`, { method: "DELETE" });
    } else {
      await fetch("/api/patients/me/saved-doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId }),
      });
    }
    setSavingBookmark(false);
  };

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
      setSelectedClinicId((findOpenClinic(doc.clinics) ?? doc.clinics[0])?.id ?? null);
      setPanelOpen(true);
      setConsultType(defaultConsultType(doc));
    }
  }, [doctors, deepLinkedDoctorId]);

  // ── Compute distances whenever userPos or doctors change ───────────────
  // Falls back to the doctor's nearest clinic when their legacy doctorProfile
  // lat/lng was never set (e.g. a doctor who only ever used the Clinics page) —
  // still needed for Home Visit ETA and the nearest-doctor badge.
  const doctorsWithDist = useMemo(() => doctors.map((d) => {
    const lat = d.doctorProfile?.lat ?? d.clinics[0]?.lat ?? null;
    const lng = d.doctorProfile?.lng ?? d.clinics[0]?.lng ?? null;
    if (lat == null || lng == null || !userPos) return d;
    return {
      ...d,
      distance: haversine(userPos[0], userPos[1], lat, lng),
    };
  }), [doctors, userPos]);

  const filteredDoctors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctorsWithDist.filter((d) => {
      const matchesSpecialty = !specialtyFilter || d.doctorProfile?.specialty === specialtyFilter;
      const matchesSearch = !q || d.name.toLowerCase().includes(q) || (d.doctorProfile?.specialty ?? "").toLowerCase().includes(q);
      // Visible if EITHER at least one clinic is open right now (Clinic Visit —
      // each clinic marker also shows its own open/closed state independently
      // of this) OR the doctor's legacy Available Timings window covers now
      // (Home Visit / Video Call, which aren't clinic-specific). A doctor with
      // clinics is not exempt from the Available Timings check — otherwise
      // they'd look permanently bookable for Home Visit regardless of it.
      const hasOpenClinic = d.clinics.some((c) => isClinicOpenNow(c.slots, new Date(now)));
      const isOpenNow = hasOpenClinic || isDoctorAvailableNow(d.doctorProfile?.availability, new Date(now));
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

  // Doctors shown on the map: same specialty/search filters as the list
  // below, but NOT the "open now" check — the map should always show every
  // matching doctor, open or closed (closed clinics just render dimmed).
  const mapDoctors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctorsWithDist.filter((d) => {
      const matchesSpecialty = !specialtyFilter || d.doctorProfile?.specialty === specialtyFilter;
      const matchesSearch = !q || d.name.toLowerCase().includes(q) || (d.doctorProfile?.specialty ?? "").toLowerCase().includes(q);
      return matchesSpecialty && matchesSearch;
    });
  }, [doctorsWithDist, specialtyFilter, search]);

  // One marker per clinic, not per doctor — a doctor with several locations
  // shows up as several pins.
  const clinicMarkers = useMemo(() => {
    const list: ClinicMarker[] = [];
    for (const doc of mapDoctors) {
      for (const clinic of doc.clinics) {
        const distance = userPos ? haversine(userPos[0], userPos[1], clinic.lat, clinic.lng) : undefined;
        list.push({ doctor: doc, clinic, distance });
      }
    }
    return list;
  }, [mapDoctors, userPos]);

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

  // ── Place / update markers (one per clinic) ─────────────────────────────
  const placeClinicMarkers = useCallback(async () => {
    if (!leafletMapRef.current) return;
    const L = (await import("leaflet")).default;
    const map = leafletMapRef.current;
    const markerList = clinicMarkers;
    const nearestId = nearest?.id;
    const visibleIds = new Set(markerList.map((m) => m.clinic.id));

    // Remove markers for clinics no longer in the filtered list
    markersRef.current.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    markerList.forEach(({ doctor: doc, clinic, distance }) => {
      const color = colorFor(doc.doctorProfile?.specialty ?? "");
      const isNearest = doc.id === nearestId;
      const isOpen = isClinicOpenNow(clinic.slots, new Date(now));
      const html = makeAvatarMarkerHtml({
        name: doc.name,
        photoUrl: doc.doctorProfile?.photoUrl ?? null,
        color,
        isOpen,
        pulse: isNearest,
      });
      const icon = L.divIcon({
        html,
        className: "",
        iconSize: [44, 52],
        iconAnchor: [22, 52],
        popupAnchor: [0, -52],
      });
      const tooltipHtml = makeMarkerTooltipHtml({
        doctorName: formatDoctorName(doc.name),
        specialty: doc.doctorProfile?.specialty ?? "",
        avgRating: doc.doctorProfile?.avgRating ?? 0,
        totalReviews: doc.doctorProfile?.totalReviews ?? 0,
        clinicName: clinic.name,
        isOpen,
        distanceKm: distance,
      });

      if (markersRef.current.has(clinic.id)) {
        // update icon + tooltip only
        const existing = markersRef.current.get(clinic.id)!;
        existing.setIcon(icon);
        existing.setTooltipContent(tooltipHtml);
        return;
      }

      const marker = L.marker([clinic.lat, clinic.lng], { icon })
        .addTo(map)
        .bindTooltip(tooltipHtml, {
          direction: "top",
          offset: [0, -50],
          opacity: 1,
          className: "doctor-marker-tooltip",
        })
        .on("click", () => {
          setSelectedDoctor(doc);
          setSelectedClinicId(clinic.id);
          setPanelOpen(true);
          setBookingOpen(false);
          setConsultType(defaultConsultType(doc));
          setSymptoms("");
          setRelation("Self");
          setDependentId(null);
          setConsentGiven(false);
          setBooked(null);
          setBookingError("");
          setScheduleMode("NOW");
        });

      markersRef.current.set(clinic.id, marker);
    });
  }, [clinicMarkers, nearest?.id, colorFor, now]);

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
      await placeClinicMarkers();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos]);

  // ── Re-place markers when doctors list, filters, or marker colors change ──
  // `colorFor` falls back to a generic blue until /api/specialties resolves,
  // so it's a required dep here — otherwise markers placed before that fetch
  // finishes stay the wrong color until the unrelated 60s `now` tick happens
  // to fire and incidentally re-place them.
  useEffect(() => {
    if (!leafletMapRef.current) return;
    placeClinicMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors, specialtyFilter, search, now, colorFor]);

  const selectedClinic = selectedDoctor?.clinics.find((c) => c.id === selectedClinicId) ?? null;

  // Distance shown in the doctor panel's chip row — follows whichever
  // clinic the patient has selected, not just the doctor's first/legacy
  // location (that one still drives Home Visit reachability separately).
  const selectedClinicDistance = selectedClinic && userPos
    ? haversine(userPos[0], userPos[1], selectedClinic.lat, selectedClinic.lng)
    : selectedDoctor?.distance ?? null;

  // ── Fly to selected clinic (falls back to the doctor's legacy single location) ──
  useEffect(() => {
    const lat = selectedClinic?.lat ?? selectedDoctor?.doctorProfile?.lat;
    const lng = selectedClinic?.lng ?? selectedDoctor?.doctorProfile?.lng;
    if (!lat || !lng || !leafletMapRef.current) return;
    leafletMapRef.current.flyTo(
      [lat, lng],
      15,
      { duration: 0.8 }
    );
  }, [selectedDoctor, selectedClinic]);

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
    setBookingError("");
    const fee = feeForConsultType(selectedDoctor.doctorProfile, consultType);

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doctorId: selectedDoctor.id,
        symptoms,
        dependentId,
        allergies,
        consentGiven,
        consultType,
        amount: fee,
        paymentMethod: "ONLINE",
        followUpOfId: followUpOfId ?? undefined,
        clinicId: consultType === "CLINIC" ? selectedClinicId : undefined,
        patientLat: userPos?.[0],
        patientLng: userPos?.[1],
        ...(scheduleMode === "LATER" && scheduledAt
          ? { scheduledAt: new Date(scheduledAt).toISOString() }
          : {}),
      }),
    });
    const data = await res.json();
    setBooking(false);
    if (res.ok) setBooked({ id: data.id, fee });
    else setBookingError(data.error ?? "Booking failed. Please try again.");
  };

  // ── Emergency quick-book ────────────────────────────────────────────────
  const submitEmergency = async () => {
    if (!user?.id || !nearestAny) return;
    setEmergencyBusy(true);
    setEmergencyError("");
    const type = defaultConsultType(nearestAny);
    const fee = feeForConsultType(nearestAny.doctorProfile, type);

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doctorId: nearestAny.id,
        symptoms: emergencyText || "Emergency request",
        consultType: type,
        amount: fee,
        paymentMethod: "ONLINE",
        isEmergency: true,
        patientLat: userPos?.[0],
        patientLng: userPos?.[1],
      }),
    });
    const data = await res.json().catch(() => ({}));
    setEmergencyBusy(false);
    if (res.ok) {
      setEmergencyResult({
        doctorName: formatDoctorName(nearestAny.name),
        eta: estimateArrivalMinutes(nearestAny.distance ?? 0),
      });
    } else {
      setEmergencyError(data.error ?? "Could not send the request. Please try again.");
    }
  };

  const fee = feeForConsultType(selectedDoctor?.doctorProfile, consultType);

  const eta = selectedDoctor?.distance != null ? estimateArrivalMinutes(selectedDoctor.distance) : null;

  // The moment the appointment would actually happen — "now" for an
  // immediate booking, or the chosen date/time when scheduled later —
  // is what a clinic's open/closed hours get checked against.
  const effectiveBookingTime =
    scheduleMode === "LATER" && scheduledAt ? new Date(scheduledAt) : new Date(now);

  // Whether any of the doctor's clinics is actually open at the effective
  // booking time — doctors with no clinics at all keep the legacy
  // unrestricted behavior (same fallback as clinicBookingBlocked below).
  const hasOpenClinic =
    !selectedDoctor || selectedDoctor.clinics.length === 0 ||
    selectedDoctor.clinics.some((c) => isClinicOpenNow(c.slots, effectiveBookingTime));

  // Home Visit is only offered within the doctor's stated consultation
  // radius — beyond that they simply can't travel there. Unknown distance
  // (no patient location yet) doesn't block it.
  const homeVisitDistanceKm = selectedDoctor?.distance ?? null;
  const homeVisitRadiusKm = selectedDoctor?.doctorProfile?.radius ?? null;
  const hasHomeVisitReach = !(homeVisitDistanceKm != null && homeVisitRadiusKm != null && homeVisitDistanceKm > homeVisitRadiusKm);

  const availableTypes = ALL_TYPES.filter((t) => {
    if (t.id === "HOME") return selectedDoctor?.doctorProfile?.offersHomeVisit !== false && hasHomeVisitReach;
    if (t.id === "CLINIC") return selectedDoctor?.doctorProfile?.offersClinic !== false && hasOpenClinic;
    if (t.id === "VIDEO") return selectedDoctor ? selectedDoctor.doctorProfile?.offersVideo === true : true;
    return true;
  });

  // A Clinic Visit can only be confirmed once a specific, currently-open
  // clinic is selected — doctors with no clinics at all fall back to the
  // legacy unrestricted behavior.
  const clinicBookingBlocked =
    consultType === "CLINIC" &&
    selectedDoctor != null &&
    selectedDoctor.clinics.length > 0 &&
    (!selectedClinic || !isClinicOpenNow(selectedClinic.slots, effectiveBookingTime));

  const homeVisitBlocked = consultType === "HOME" && !hasHomeVisitReach;

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

      {!isLoading && <AnnouncementPopup onAllSeen={() => setAnnouncementsDone(true)} />}
      {!isLoading && announcementsDone && <EnableNotificationsPrompt />}

      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div className="absolute top-0 inset-x-0 z-20 pointer-events-none">
        <div className="flex items-start justify-between p-3 sm:p-4 gap-2 sm:gap-3">
          {/* Logo / title */}
          <div className="glass-card rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2.5 sm:gap-3 pointer-events-auto shadow-lg min-w-0">
            <img src="/logo-icon.png" alt="DocOnClick" className="w-8 h-8 sm:w-9 sm:h-9 object-contain flex-shrink-0" />
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
              onClick={() => router.push("/patient/assistant")}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity"
              title="Health Assistant"
            >
              <Sparkles className="w-4 h-4" /> Ask AI
            </button>
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
                setSelectedClinicId((findOpenClinic(nearest.clinics) ?? nearest.clinics[0])?.id ?? null);
                setPanelOpen(true);
                setBookingOpen(false);
                setConsultType(defaultConsultType(nearest));
              }}
              className="glass-card rounded-2xl pl-3 pr-3 py-2.5 flex items-center gap-2 pointer-events-auto shadow-lg hover:scale-[1.02] transition-transform min-w-0 flex-1 sm:flex-initial"
            >
              <div
                className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
                style={{ backgroundColor: colorFor(nearest.doctorProfile.specialty) }}
              />
              <span className="text-xs font-semibold text-slate-700 truncate min-w-0">
                Nearest: <span className="text-blue-600">{formatDoctorName(nearest.name)}</span>
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
          onClick={() => { setEmergencyOpen(true); setEmergencyText(""); setEmergencyResult(null); setEmergencyError(""); }}
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
            {clinicMarkers.length} clinics nearby
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
                      Waiting for {formatDoctorName(selectedDoctor.name)} to confirm your {consultType === "HOME" ? "home visit" : "appointment"}.
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-2">ID: {booked.id.slice(0, 14)}…</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 w-full">
                    You&apos;ll be notified once accepted — pay online from My Appointments after that.
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
                    {formatDoctorName(selectedDoctor.name)} · {selectedDoctor.doctorProfile.specialty}
                  </p>

                  {/* Consult type */}
                  <div className={`grid gap-2 mb-4 ${availableTypes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                    {availableTypes.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setConsultType(id)}
                        className={`relative flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all ${
                          consultType === id
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >
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

                  {/* Home Visit distance gate */}
                  {homeVisitBlocked && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-red-800">
                          {formatDoctorName(selectedDoctor.name)} is {homeVisitDistanceKm?.toFixed(1)} km away — too far for a home visit right now.
                        </p>
                        <p className="text-xs text-red-700 mt-0.5">
                          They only offer home visits within {homeVisitRadiusKm} km. Try Clinic Visit or Video Call instead.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Clinic location (only for Clinic Visit, when the doctor has clinics) */}
                  {consultType === "CLINIC" && selectedDoctor.clinics.length > 0 && (
                    <div className="mb-4">
                      {selectedDoctor.clinics.length > 1 && (
                        <div className="mb-2">
                          <label className="input-label">Choose Clinic</label>
                          <select
                            className="input-field"
                            value={selectedClinicId ?? ""}
                            onChange={(e) => setSelectedClinicId(e.target.value)}
                          >
                            {selectedDoctor.clinics.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} — {isClinicOpenNow(c.slots, effectiveBookingTime) ? "Open" : "Closed"} {scheduleMode === "LATER" ? "at that time" : "now"}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {selectedClinic && (
                        <div className="rounded-xl border border-slate-200 px-4 py-3 mb-2">
                          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" /> {selectedClinic.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{selectedClinic.address}</p>
                        </div>
                      )}
                      {selectedClinic && !isClinicOpenNow(selectedClinic.slots, effectiveBookingTime) && (() => {
                        const openClinic = findOpenClinic(
                          selectedDoctor.clinics.filter((c) => c.id !== selectedClinic.id),
                          effectiveBookingTime
                        );
                        return (
                          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-red-800">
                                Not available at this clinic {scheduleMode === "LATER" ? "at the selected time" : "right now"} — booking is disabled here.
                              </p>
                              {openClinic ? (
                                <>
                                  <p className="text-xs text-red-700 mt-0.5">
                                    {scheduleMode === "LATER" ? "Available at that time" : "Currently available"} at {openClinic.name} — {openClinic.address}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedClinicId(openClinic.id)}
                                    className="text-xs font-bold text-red-800 underline mt-1"
                                  >
                                    Switch &amp; book here instead
                                  </button>
                                </>
                              ) : (
                                <p className="text-xs text-red-700 mt-0.5">
                                  No clinic is available {scheduleMode === "LATER" ? "at the selected time" : "right now"} — please pick a different time or clinic.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

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

                  {/* Who is this for */}
                  <label className="input-label"><Users className="inline w-3.5 h-3.5 mr-1" />Who is this for?</label>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {RELATIONS.map((r) => (
                      <button key={r} type="button" onClick={() => { setRelation(r); setDependentId(null); }}
                        className={`py-2 rounded-xl border text-xs font-semibold transition-all ${relation === r ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  {relation !== "Self" && (
                    <div className="mb-4">
                      <DependentPicker key={relation} relation={relation} selectedId={dependentId} onSelect={setDependentId} />
                    </div>
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

                  {bookingError && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3">{bookingError}</div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setBookingOpen(false)}
                      className="btn-secondary flex-1 justify-center py-3"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitBooking}
                      disabled={booking || !symptoms.trim() || !consentGiven || (scheduleMode === "LATER" && !scheduledAt) || (relation !== "Self" && !dependentId) || clinicBookingBlocked || homeVisitBlocked}
                      className="btn-primary flex-1 justify-center py-3"
                    >
                      {booking ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</> : `Confirm ₹${fee}`}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── DOCTOR PROFILE CARD ───────────────────────────── */
                <div className="pb-6">
                  {/* Clinic cover photo */}
                  {(selectedClinic ? selectedClinic.photoUrl : selectedDoctor.doctorProfile.clinicPhotoUrl) && (
                    <div className="w-full h-32 sm:h-40 rounded-2xl overflow-hidden bg-slate-100 mb-4 -mt-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={(selectedClinic ? selectedClinic.photoUrl : selectedDoctor.doctorProfile.clinicPhotoUrl)!}
                        alt={(selectedClinic?.name ?? selectedDoctor.doctorProfile.clinicName) ? `${selectedClinic?.name ?? selectedDoctor.doctorProfile.clinicName} — clinic photo` : "Clinic photo"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-5 pr-10">
                    {/* Avatar */}
                    {selectedDoctor.doctorProfile.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedDoctor.doctorProfile.photoUrl}
                        alt={selectedDoctor.name}
                        className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 shadow"
                      />
                    ) : (
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-white text-xl font-extrabold shadow"
                        style={{ background: `linear-gradient(135deg, ${colorFor(selectedDoctor.doctorProfile.specialty)}, ${colorFor(selectedDoctor.doctorProfile.specialty)}99)` }}
                      >
                        {selectedDoctor.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-extrabold text-slate-900 leading-tight">{formatDoctorName(selectedDoctor.name)}</h3>
                        {selectedDoctor.doctorProfile.isVerified && <VerifiedBadge />}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{selectedDoctor.doctorProfile.specialty}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{selectedDoctor.doctorProfile.qualification}</p>
                      {selectedDoctor.clinics.length > 0 ? (
                        <div className="mt-1.5 space-y-1">
                          {selectedDoctor.clinics.map((c) => {
                            const open = isClinicOpenNow(c.slots, effectiveBookingTime);
                            const isSelected = c.id === selectedClinicId;
                            const when = open ? null : formatNextOpeningText(findNextOpening([c], effectiveBookingTime));
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setSelectedClinicId(c.id)}
                                className={`w-full flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                                  isSelected ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <Building2 className="w-3 h-3 flex-shrink-0 text-slate-400" />
                                  <span className="text-xs font-medium text-slate-700 truncate">{c.name}</span>
                                </span>
                                {open ? (
                                  <span className="badge badge-success !px-1.5 !py-0 text-[10px] flex-shrink-0">Available now</span>
                                ) : when ? (
                                  <span className="text-[10px] text-slate-500 flex-shrink-0 flex items-center gap-1">
                                    <Clock className="w-3 h-3 flex-shrink-0 text-slate-400" /> Opens {when}
                                  </span>
                                ) : (
                                  <span className="badge badge-gray !px-1.5 !py-0 text-[10px] flex-shrink-0">Closed</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : selectedDoctor.doctorProfile.clinicName && (
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <Building2 className="w-3 h-3 flex-shrink-0" /> {selectedDoctor.doctorProfile.clinicName}
                        </p>
                      )}
                      <div className="mt-1.5">
                        <RatingStars
                          avgRating={selectedDoctor.doctorProfile.avgRating}
                          totalReviews={selectedDoctor.doctorProfile.totalReviews}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleSaveDoctor}
                      disabled={savingBookmark}
                      title={savedDoctorIds.has(selectedDoctor.id) ? "Remove from saved doctors" : "Save doctor for later"}
                      className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm border transition-colors flex-shrink-0 ${
                        savedDoctorIds.has(selectedDoctor.id)
                          ? "bg-blue-50 border-blue-200 text-blue-600"
                          : "bg-white border-slate-200 text-slate-400 hover:text-blue-500 hover:border-blue-200"
                      }`}
                    >
                      {savedDoctorIds.has(selectedDoctor.id) ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Chips row */}
                  <div className="flex flex-wrap gap-2 mb-5">
                    <span className="badge badge-info">{selectedDoctor.doctorProfile.experience} yrs exp</span>
                    {selectedClinicDistance != null && (
                      <span className="badge badge-success">
                        <Navigation className="w-3 h-3" /> {selectedClinicDistance.toFixed(1)} km
                      </span>
                    )}
                    {selectedDoctor.clinics.length > 0 ? (() => {
                      const clinicForHours = selectedClinic ?? selectedDoctor.clinics[0];
                      const open = isClinicOpenNow(clinicForHours.slots, effectiveBookingTime);
                      const when = open ? null : formatNextOpeningText(findNextOpening([clinicForHours], effectiveBookingTime));
                      return (
                        <span className={`badge ${open ? "badge-success" : "badge-gray"}`}>
                          <Clock className="w-3 h-3" /> {open ? "Open now" : when ? `Opens ${when}` : "Closed"}
                        </span>
                      );
                    })() : (
                      <span className="badge badge-gray">
                        <Clock className="w-3 h-3" /> {selectedDoctor.doctorProfile.availability}
                      </span>
                    )}
                    <span className="badge badge-purple">
                      <Languages className="w-3 h-3" /> {selectedDoctor.doctorProfile.languages}
                    </span>
                  </div>

                  {selectedDoctor.doctorProfile.bio && (
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3.5 mb-5 leading-relaxed">
                      {selectedDoctor.doctorProfile.bio}
                    </p>
                  )}

                  {/* Fee cards — a service the doctor doesn't offer at all is
                      left out entirely rather than shown as disabled; only
                      temporary unavailability (clinic closed, outside
                      home-visit range) still renders a disabled card with a
                      reason. */}
                  {(() => {
                    const offersClinic = selectedDoctor.doctorProfile.offersClinic !== false;
                    const offersVideo = selectedDoctor.doctorProfile.offersVideo === true;
                    const offersHome = selectedDoctor.doctorProfile.offersHomeVisit;
                    const offeredCount = [offersClinic, offersVideo, offersHome].filter(Boolean).length;
                    if (offeredCount === 0) return null;
                    return (
                      <div className={cn("grid gap-3 mb-3", offeredCount === 1 ? "grid-cols-1" : offeredCount === 2 ? "grid-cols-2" : "grid-cols-3")}>
                        {offersClinic && (
                          hasOpenClinic ? (
                            <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                              <Building2 className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                              <p className="text-xs text-slate-500">Clinic Visit</p>
                              <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{selectedDoctor.doctorProfile.consultFee}</p>
                            </div>
                          ) : (
                            <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center flex flex-col items-center justify-center">
                              <Building2 className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                              <p className="text-xs text-slate-400">Clinic closed right now</p>
                            </div>
                          )
                        )}
                        {offersVideo && (
                          <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                            <Video className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                            <p className="text-xs text-slate-500">Video Call</p>
                            <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{selectedDoctor.doctorProfile.videoFee}</p>
                          </div>
                        )}
                        {offersHome && (
                          hasHomeVisitReach ? (
                            <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                              <Home className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                              <p className="text-xs text-slate-500">Home Visit</p>
                              <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{selectedDoctor.doctorProfile.homeVisitFee}</p>
                              {selectedDoctor.distance != null && (
                                <p className="text-[10px] text-slate-400 mt-0.5">~{estimateArrivalMinutes(selectedDoctor.distance)} min arrival</p>
                              )}
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

                  {/* CTA buttons — a service the doctor doesn't offer at all
                      is left out entirely rather than shown as a disabled
                      button; only temporary unavailability (clinic closed,
                      outside home-visit range) still renders a disabled
                      button. */}
                  {(() => {
                    const offersClinic = selectedDoctor.doctorProfile.offersClinic !== false;
                    const offersVideo = selectedDoctor.doctorProfile.offersVideo === true;
                    const offersHome = selectedDoctor.doctorProfile.offersHomeVisit;
                    const offeredCount = [offersClinic, offersVideo, offersHome].filter(Boolean).length;
                    if (offeredCount === 0) return null;
                    const clinicAvailable = offersClinic && hasOpenClinic;
                    const homeAvailable = offersHome && hasHomeVisitReach;
                    const baseClass = "flex flex-col items-center justify-center gap-1 rounded-xl py-3 text-xs font-semibold transition-colors border";
                    const availableClass = "border-blue-200 bg-blue-50 text-blue-600 hover:border-blue-600 hover:bg-blue-600 hover:text-white";
                    const disabledClass = "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed";
                    const classFor = (available: boolean) => (available ? availableClass : disabledClass);
                    return (
                      <div className={cn("grid gap-2", offeredCount === 1 ? "grid-cols-1" : offeredCount === 2 ? "grid-cols-2" : "grid-cols-3")}>
                        {offersClinic && (
                          <button
                            type="button"
                            onClick={() => { setConsultType("CLINIC"); setBookingOpen(true); }}
                            disabled={!clinicAvailable}
                            className={cn(baseClass, classFor(clinicAvailable))}
                          >
                            <Building2 className="w-4 h-4" /> Book Clinic Visit
                          </button>
                        )}
                        {offersVideo && (
                          <button
                            type="button"
                            onClick={() => { setConsultType("VIDEO"); setBookingOpen(true); }}
                            className={cn(baseClass, availableClass)}
                          >
                            <Video className="w-4 h-4" /> Book Video Consultation
                          </button>
                        )}
                        {offersHome && (
                          <button
                            type="button"
                            onClick={() => { setConsultType("HOME"); setBookingOpen(true); }}
                            disabled={!homeAvailable}
                            className={cn(baseClass, classFor(homeAvailable))}
                          >
                            <Home className="w-4 h-4" /> Book Home Visit
                          </button>
                        )}
                      </div>
                    );
                  })()}
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
                  {emergencyResult.doctorName} has been notified and flagged as urgent — waiting for them to accept. Estimated arrival once accepted: ~{emergencyResult.eta} min. Pay online from My Appointments once accepted.
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
                  {nearestAny ? <> — <strong>{formatDoctorName(nearestAny.name)}</strong> ({nearestAny.distance?.toFixed(1)} km away)</> : null}.
                </p>
                <textarea
                  rows={3}
                  className="input-field resize-none mb-4"
                  placeholder="Briefly describe what's happening…"
                  value={emergencyText}
                  onChange={(e) => setEmergencyText(e.target.value)}
                />
                {emergencyError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3">{emergencyError}</div>
                )}
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
