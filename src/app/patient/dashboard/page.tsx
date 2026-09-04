"use client";
import "leaflet/dist/leaflet.css";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MapPin, Home, Building2, Video, Stethoscope, Clock,
  ChevronDown, X, Loader2, UserCircle, Languages,
  Navigation, AlertCircle, IndianRupee, CalendarClock,
  CalendarCheck2, AlertTriangle, ShieldCheck, Users, Search,
  Bookmark, BookmarkCheck, Sparkles, Compass, RefreshCw, Crosshair,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useSpecialties } from "@/lib/useSpecialties";
import { isClinicOpenNow, findOpenClinic, findNextOpening, formatSlotTime, formatClinicHours } from "@/lib/clinicAvailability";
import { estimateArrivalMinutes } from "@/lib/eta";
import { RELATIONS } from "@/lib/relations";
import { haversine, withinSearchRadius } from "@/lib/geo";
import { cn, formatDoctorName } from "@/lib/utils";
import { isNative, getCurrentPositionCompat } from "@/lib/platform";
import RatingStars from "@/components/patient/RatingStars";
import VerifiedBadge from "@/components/patient/VerifiedBadge";
import SpecialtyFilter from "@/components/patient/SpecialtyFilter";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import EnableNotificationsPrompt from "@/components/EnableNotificationsPrompt";
import AnnouncementPopup from "@/components/AnnouncementPopup";
import DependentPicker from "@/components/patient/DependentPicker";
import AddressAutocomplete from "@/components/patient/AddressAutocomplete";
import ConfirmDialog from "@/components/ConfirmDialog";
import { readPatientLocation, writePatientLocation } from "@/lib/patientLocation";
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
  { id: "VIDEO", label: "Video Consultation", icon: Video },
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

// A <input type="datetime-local"> value for the start of an upcoming clinic
// opening — used to prefill the scheduler so a "book it here anyway" tap lands
// on a time the clinic is actually open.
function nextOpeningLocalInput(next: { daysAhead: number; fromTime: string }) {
  const d = new Date();
  d.setDate(d.getDate() + next.daysAhead);
  const [h, m] = next.fromTime.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// ══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════
function PatientDashboardInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { specialties, colorFor } = useSpecialties();

  // State
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [posError, setPosError] = useState(false);
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [search, setSearch] = useState("");
  // Patient's "doctor search range" preference (km); null = no limit.
  const [searchRadiusKm, setSearchRadiusKm] = useState<number | null>(null);
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
  const [confirmBookingOpen, setConfirmBookingOpen] = useState(false);
  const [booked, setBooked] = useState<{ id: string; fee: number } | null>(null);
  const [bookingError, setBookingError] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [announcementsDone, setAnnouncementsDone] = useState(false);
  const followUpOfId = searchParams.get("followUpOf");
  const deepLinkedDoctorId = searchParams.get("doctorId");
  const didDeepLink = useRef(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const userLayersRef = useRef<import("leaflet").Layer[]>([]);

  // A patient can browse around a place other than their GPS position (e.g.
  // booking for a relative in another city). `customLabel` is non-null while
  // that's active; the coordinates live in `userPos` like any other.
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locatingGps, setLocatingGps] = useState(false);
  const [pickingOnMap, setPickingOnMap] = useState(false);

  // ── Set the reference location: a stored custom place, else GPS ─────────
  // Some mobile browsers/WebViews never invoke either getCurrentPosition
  // callback (geolocation missing, permission prompt left unanswered, etc.),
  // which used to leave userPos — and therefore the whole map — stuck at
  // null forever. A JS-level fallback timer guarantees we always fall back
  // to the Pune default instead of silently showing no markers.
  useEffect(() => {
    const stored = readPatientLocation();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserPos([stored.lat, stored.lng]);
      setCustomLabel(stored.label);
      setPosError(false);
      return;
    }

    let settled = false;
    const fallback = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setPosError(true);
      setUserPos([18.5204, 73.8567]); // Pune fallback
    }, 8000);

    if (!isNative() && !navigator.geolocation) {
      return;
    }

    getCurrentPositionCompat({ timeout: 8000 })
      .then((pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        setPosError(true);
        setUserPos([18.5204, 73.8567]); // Pune fallback
      });

    return () => window.clearTimeout(fallback);
  }, []);

  // Re-acquire GPS on demand (used by the map's refresh control). Unlike the
  // mount effect there's no fallback timer — a manual refresh just keeps the
  // last known position if the lookup fails.
  const acquireLocation = useCallback(async () => {
    if (readPatientLocation()) return; // a custom place is pinned — leave it
    try {
      const pos = await getCurrentPositionCompat({ timeout: 8000 });
      setUserPos([pos.coords.latitude, pos.coords.longitude]);
      setPosError(false);
    } catch {
      /* keep current position */
    }
  }, []);

  // Pin a chosen place as the browse location, shared with the booking page.
  const applyCustomLocation = (lat: number, lng: number, label: string) => {
    setUserPos([lat, lng]);
    setCustomLabel(label);
    setPosError(false);
    setLocationPickerOpen(false);
    setPickingOnMap(false);
    setLocationQuery("");
    writePatientLocation({ lat, lng, label });
  };

  // Drop the custom place and go back to the device's GPS.
  const switchToMyLocation = async () => {
    setCustomLabel(null);
    writePatientLocation(null);
    setLocatingGps(true);
    try {
      const pos = await getCurrentPositionCompat({ timeout: 8000 });
      setUserPos([pos.coords.latitude, pos.coords.longitude]);
      setPosError(false);
      setLocationPickerOpen(false);
    } catch {
      setPosError(true);
    } finally {
      setLocatingGps(false);
    }
  };

  // "Pick on map" — take whatever the map is centred on, name it, pin it.
  const [confirmingPick, setConfirmingPick] = useState(false);
  const confirmMapPick = async () => {
    const map = leafletMapRef.current;
    if (!map) { setPickingOnMap(false); return; }
    const c = map.getCenter();
    setConfirmingPick(true);
    let label = `${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`;
    try {
      const r = await fetch(`/api/geocode/reverse?lat=${c.lat}&lon=${c.lng}`);
      if (r.ok) {
        const d = await r.json();
        if (d?.label) label = String(d.label).split(",").slice(0, 2).join(",").trim();
      }
    } catch {
      /* keep the coordinate label */
    }
    setConfirmingPick(false);
    applyCustomLocation(c.lat, c.lng, label);
  };

  // ── Fetch doctors ──────────────────────────────────────────────────────
  const loadDoctors = useCallback(async () => {
    try {
      const r = await fetch("/api/doctors");
      if (r.ok) setDoctors(await r.json());
    } catch {
      /* keep current list */
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadDoctors(); }, [loadDoctors]);

  // ── Fetch this patient's bookmarked doctors, for the save toggle in the detail panel ──
  const loadSavedDoctors = useCallback(async () => {
    if (!user || user.role !== "PATIENT") return;
    try {
      const r = await fetch("/api/patients/me/saved-doctors");
      const d: { saved?: { doctor: { id: string } }[] } | { doctor: { id: string } }[] =
        r.ok ? await r.json() : { saved: [] };
      const list = Array.isArray(d) ? d : d.saved ?? [];
      setSavedDoctorIds(new Set(list.map((s) => s.doctor.id)));
    } catch {
      /* keep current set */
    }
  }, [user]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadSavedDoctors(); }, [loadSavedDoctors]);

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

  // The one filtered set the map page works with: matches the search + specialty
  // filter AND has at least one clinic pin on the map. Deliberately NOT gated on
  // "open right now" — a closed clinic still renders a (dimmed) pin and is
  // bookable for a future slot, so search results and map pins stay in sync.
  // Distance from the patient to a specific clinic, or null when unknown.
  const clinicDistance = useCallback(
    (clinic: { lat: number; lng: number }) =>
      userPos ? haversine(userPos[0], userPos[1], clinic.lat, clinic.lng) : null,
    [userPos],
  );

  // "Show all" from the empty-state banner temporarily lifts the radius filter.
  const [ignoreRadius, setIgnoreRadius] = useState(false);
  const effectiveRadiusKm = ignoreRadius ? null : searchRadiusKm;

  const mapDoctors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctorsWithDist.filter((d) => {
      const matchesSpecialty = !specialtyFilter || d.doctorProfile?.specialty === specialtyFilter;
      const matchesSearch = !q || d.name.toLowerCase().includes(q) || (d.doctorProfile?.specialty ?? "").toLowerCase().includes(q);
      // The map is a proximity tool: a doctor shows only if they have at least
      // one clinic pin *within the search range*. The "video is location-
      // independent" exception deliberately does NOT apply to map pins — a far
      // video doctor still surfaces in search, the Assistant and saved list,
      // just not as a misleading pin 100 km away.
      const hasClinicInRange = d.clinics.some((c) =>
        withinSearchRadius(clinicDistance(c), effectiveRadiusKm, false),
      );
      return matchesSpecialty && matchesSearch && hasClinicInRange;
    });
  }, [doctorsWithDist, specialtyFilter, search, effectiveRadiusKm, clinicDistance]);

  const sorted = useMemo(() => [...mapDoctors].sort(
    (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
  ), [mapDoctors]);
  const nearest = sorted[0];

  // One marker per clinic, not per doctor — a doctor with several locations
  // shows up as several pins.
  const clinicMarkers = useMemo(() => {
    const list: ClinicMarker[] = [];
    for (const doc of mapDoctors) {
      for (const clinic of doc.clinics) {
        const d = clinicDistance(clinic);
        // Each pin is filtered on its own distance — a doctor with a nearby
        // clinic and a far one only pins the nearby location.
        if (!withinSearchRadius(d, effectiveRadiusKm, false)) continue;
        list.push({ doctor: doc, clinic, distance: d ?? undefined });
      }
    }
    return list;
  }, [mapDoctors, clinicDistance, effectiveRadiusKm]);

  // ── Initialise Leaflet once map div is available ───────────────────────
  const initMap = useCallback(
    async (center: [number, number]) => {
      if (!mapRef.current || leafletMapRef.current) return;
      const L = (await import("leaflet")).default;

      // Fix default icon path issue with bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: markerIconUrl.src,
        iconRetinaUrl: markerIcon2xUrl.src,
        shadowUrl: markerShadowUrl.src,
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
          setConfirmBookingOpen(false);
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
    // Drop any previous user marker/circle first so a location refresh doesn't
    // stack duplicates.
    userLayersRef.current.forEach((layer) => map.removeLayer(layer));
    userLayersRef.current = [
      L.marker(pos, { icon: userIcon, zIndexOffset: 1000 }).addTo(map),
      L.circle(pos, { radius: 300, color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.06, weight: 1.5 }).addTo(map),
    ];
  }, []);

  // ── Boot sequence: wait for userPos then init map ──────────────────────
  useEffect(() => {
    if (!userPos) return;
    // requestAnimationFrame ensures React has committed the map <div> to the
    // DOM before Leaflet tries to find it (avoids "Map container not found")
    const raf = requestAnimationFrame(async () => {
      await initMap(userPos);
      // On a location refresh the map already exists — recentre it on the
      // new position.
      leafletMapRef.current?.setView(userPos, leafletMapRef.current.getZoom());
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

  // ── Load the patient profile: completion %, search range, allergies ─────
  const [profilePercent, setProfilePercent] = useState<number | null>(null);
  const loadProfile = useCallback(async () => {
    if (!user || user.role !== "PATIENT") return;
    try {
      const d = await (await fetch("/api/patients/me")).json();
      const { percent } = computeCompleteness(d.patientProfile);
      setProfilePercent(percent);
      setSearchRadiusKm(d.patientProfile?.searchRadiusKm ?? null);
      if (d.patientProfile?.allergies) setAllergies(d.patientProfile.allergies);
      if (percent < 100 && !sessionStorage.getItem("profilePromptSeen")) {
        sessionStorage.setItem("profilePromptSeen", "1");
        router.replace("/patient/profile");
      }
    } catch {
      /* keep current values */
    }
  }, [user, router]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ── Manual refresh of everything the map shows ─────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const refreshMap = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.allSettled([loadDoctors(), loadSavedDoctors(), loadProfile(), acquireLocation()]);
    setRefreshing(false);
  }, [refreshing, loadDoctors, loadSavedDoctors, loadProfile, acquireLocation]);

  // ── Booking submit ─────────────────────────────────────────────────────
  // "Confirm ₹X" only opens the confirmation dialog; confirmAndBook fires the
  // actual request once the patient confirms.
  const submitBooking = () => {
    if (!user?.id || !selectedDoctor || !consentGiven) return;
    if (clinicBookingBlocked) {
      setBookingError(
        scheduleMode === "LATER"
          ? "The clinic isn't open at the time you picked. Choose a time within the clinic's hours."
          : "This clinic is closed right now. Switch to Schedule Later and pick a time when it's open."
      );
      return;
    }
    if (scheduleMode === "LATER" && scheduledAt && new Date(scheduledAt).getTime() <= new Date().getTime()) {
      setBookingError("Please pick a time in the future.");
      return;
    }
    setBookingError("");
    setConfirmBookingOpen(true);
  };

  const confirmAndBook = async () => {
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
    setConfirmBookingOpen(false);
    if (res.ok) setBooked({ id: data.id, fee });
    else setBookingError(data.error ?? "Booking failed. Please try again.");
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
    // Clinic stays offered even when every clinic is closed right now — the
    // patient can still schedule the visit for an upcoming open slot.
    if (t.id === "CLINIC") return selectedDoctor?.doctorProfile?.offersClinic !== false;
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
      <div className={cn("absolute top-0 inset-x-0 z-20 pointer-events-none", pickingOnMap && "hidden")}>
        <div
          className="flex items-start justify-between p-3 sm:p-4 gap-2 sm:gap-3"
          style={{ paddingTop: "calc(0.75rem + var(--safe-area-inset-top, env(safe-area-inset-top)))" }}
        >
          {/* Logo / title — tap the location line to change it */}
          <button
            onClick={() => setLocationPickerOpen(true)}
            className="glass-card rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2.5 sm:gap-3 pointer-events-auto shadow-lg min-w-0 text-left"
          >
            <div className="min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="DocOnClick" className="h-6 sm:h-7 w-auto object-contain" />
              <p className={cn("text-xs mt-0.5 truncate", customLabel ? "text-blue-600 font-semibold" : "text-slate-500")}>
                {customLabel ? `📍 ${customLabel}` : posError ? "📍 Set your location" : "📍 Your location · Change"}
              </p>
            </div>
          </button>

          {/* Right: quick actions + profile */}
          <div className="glass-card rounded-2xl px-2.5 sm:px-4 py-2.5 sm:py-3 flex items-center gap-1.5 sm:gap-3 pointer-events-auto shadow-lg flex-shrink-0">
            {profilePercent != null && profilePercent < 100 && (
              <button
                onClick={() => router.push("/patient/profile")}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
                title="Complete your profile"
              >
                Profile {profilePercent}%
              </button>
            )}
            <button
              onClick={() => router.push("/patient/assistant")}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity"
              title="Health Assistant"
            >
              <Sparkles className="w-4 h-4" /> Ask AI
            </button>
            <button
              onClick={() => router.push("/patient/appointments")}
              className="hidden lg:flex w-8 h-8 rounded-xl bg-blue-50 items-center justify-center text-blue-500 hover:bg-blue-100 transition-colors"
              title="My Appointments"
            >
              <CalendarCheck2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.push("/patient/profile")}
              className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors flex-shrink-0"
              title="Profile"
            >
              <UserCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search, filters, refresh and where-you're-searching info — one
            card instead of three separate floating rows, so glancing at the
            top of the screen reads as "identity" then "search", not five
            competing pills. */}
        <div className="px-3 sm:px-4 pointer-events-auto">
          <div className="glass-card rounded-2xl p-2.5 max-w-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1 min-w-0">
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
              <button
                onClick={refreshMap}
                disabled={refreshing}
                className="w-9 h-9 rounded-xl bg-white/80 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-600 transition-colors disabled:opacity-60 flex-shrink-0"
                title="Refresh doctors & location"
              >
                <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
              </button>
            </div>
            <SpecialtyFilter value={specialtyFilter} onChange={setSpecialtyFilter} />
            {searchRadiusKm != null && (
              <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
                <Compass className="w-3 h-3 flex-shrink-0" />
                {ignoreRadius ? (
                  <>Showing all clinics.{" "}
                    <button type="button" onClick={() => setIgnoreRadius(false)} className="font-semibold text-blue-600 hover:underline">Limit to {searchRadiusKm} km</button>
                  </>
                ) : (
                  <>Showing clinics within {searchRadiusKm} km.{" "}
                    <button type="button" onClick={() => router.push("/patient/profile")} className="font-semibold text-blue-600 hover:underline">Change</button>
                  </>
                )}
              </p>
            )}

            {/* Where you're searching from — folded into the same card
                instead of its own floating pill below. */}
            {customLabel ? (
              <button
                onClick={switchToMyLocation}
                className="flex items-center gap-2 w-full text-left mt-2 pt-2 border-t border-slate-100"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-slate-700 truncate min-w-0">
                  {customLabel} <span className="text-blue-600">· Use my location</span>
                </span>
              </button>
            ) : posError ? (
              <button
                onClick={() => setLocationPickerOpen(true)}
                className="flex items-center gap-2 w-full text-left mt-2 pt-2 border-t border-slate-100"
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-slate-700 truncate min-w-0">
                  Showing Pune — <span className="text-blue-600">Set your location</span>
                </span>
              </button>
            ) : nearest?.doctorProfile && (
              <button
                onClick={() => {
                  setSelectedDoctor(nearest);
                  setSelectedClinicId((findOpenClinic(nearest.clinics) ?? nearest.clinics[0])?.id ?? null);
                  setPanelOpen(true);
                  setBookingOpen(false);
                  setConsultType(defaultConsultType(nearest));
                }}
                className="flex items-center gap-2 w-full text-left mt-2 pt-2 border-t border-slate-100"
              >
                <div
                  className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
                  style={{ backgroundColor: colorFor(nearest.doctorProfile.specialty) }}
                />
                <span className="text-xs font-semibold text-slate-700 truncate min-w-0 flex-1">
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
          </div>
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────── */}
      <div className={cn("hidden lg:block absolute bottom-6 left-4 z-20 pointer-events-none", pickingOnMap && "lg:hidden")}>
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
      <div className={cn("absolute bottom-[calc(5rem_+_var(--safe-area-inset-bottom,env(safe-area-inset-bottom)))] lg:bottom-6 right-4 z-20 pointer-events-none", pickingOnMap && "hidden")}>
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
              paddingBottom: "var(--safe-area-inset-bottom, env(safe-area-inset-bottom))",
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
                      {consultType === "HOME" ? "Home Visit Fee" : consultType === "CLINIC" ? "Clinic Consultation Fee" : "Video Consultation Fee"}
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
                          They only offer home visits within {homeVisitRadiusKm} km. Try Clinic Visit or Video Consultation instead.
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

                      {/* When this clinic is open — so the patient knows which times they can schedule */}
                      {selectedClinic && (() => {
                        const hours = formatClinicHours(selectedClinic.slots);
                        if (hours.length === 0) return null;
                        return (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mb-2">
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

                              {/* You can still book a future appointment at THIS clinic */}
                              {(() => {
                                const nextHere = findNextOpening([selectedClinic], new Date(now));
                                if (!nextHere) return null;
                                return (
                                  <p className="text-xs text-red-700 mt-1.5 pt-1.5 border-t border-red-200">
                                    Want an appointment at {selectedClinic.name}?{" "}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setScheduleMode("LATER");
                                        setScheduledAt(nextOpeningLocalInput(nextHere));
                                      }}
                                      className="font-bold text-red-800 underline"
                                    >
                                      Schedule it for {formatNextOpeningText(nextHere)}
                                    </button>
                                  </p>
                                );
                              })()}
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
                  <div className="flex items-start gap-4 mb-4 pr-10">
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

                  {/* Clinic list — full panel width */}
                  {selectedDoctor.clinics.length > 0 ? (
                    <div className="space-y-1.5 mb-5">
                      {selectedDoctor.clinics.map((c) => {
                        const open = isClinicOpenNow(c.slots, effectiveBookingTime);
                        const isSelected = c.id === selectedClinicId;
                        const when = open ? null : formatNextOpeningText(findNextOpening([c], effectiveBookingTime));
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedClinicId(c.id)}
                            className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                              isSelected ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                              <span className="text-xs font-medium text-slate-700 truncate">{c.name}</span>
                            </span>
                            {open ? (
                              <span className="badge badge-success !px-2 !py-0.5 text-[10px] flex-shrink-0">Available now</span>
                            ) : when ? (
                              <span className="text-[11px] text-slate-500 flex-shrink-0 flex items-center gap-1">
                                <Clock className="w-3 h-3 flex-shrink-0 text-slate-400" /> Opens {when}
                              </span>
                            ) : (
                              <span className="badge badge-gray !px-2 !py-0.5 text-[10px] flex-shrink-0">Closed</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : selectedDoctor.doctorProfile.clinicName && (
                    <p className="text-xs text-slate-500 mb-5 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" /> {selectedDoctor.doctorProfile.clinicName}
                    </p>
                  )}

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
                        {offersClinic && (() => {
                          const next = hasOpenClinic ? null : formatNextOpeningText(findNextOpening(selectedDoctor.clinics, new Date(now)));
                          return (
                            <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                              <Building2 className={cn("w-5 h-5 mx-auto mb-1", hasOpenClinic ? "text-blue-500" : "text-slate-400")} />
                              <p className="text-xs text-slate-500">Clinic Visit</p>
                              <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{selectedDoctor.doctorProfile.consultFee}</p>
                              {!hasOpenClinic && (
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                  {next ? `Closed now · opens ${next}` : "Closed now · schedule for later"}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                        {offersVideo && (
                          <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                            <Video className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                            <p className="text-xs text-slate-500">Video Consultation</p>
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
                    // Clinic Visit is bookable even when closed now — the patient
                    // schedules it for an upcoming open slot in the booking panel.
                    const clinicAvailable = offersClinic;
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
                            onClick={() => {
                              setConsultType("CLINIC");
                              // Clinic closed now → open the panel already on
                              // "Schedule Later" at the next opening, so Confirm
                              // isn't disabled on arrival.
                              const c = selectedClinic ?? selectedDoctor.clinics[0];
                              const next = c && !isClinicOpenNow(c.slots) ? findNextOpening([c], new Date(now)) : null;
                              if (next) {
                                setScheduleMode("LATER");
                                setScheduledAt(nextOpeningLocalInput(next));
                              } else {
                                setScheduleMode("NOW");
                                setScheduledAt("");
                              }
                              setBookingOpen(true);
                            }}
                            disabled={!clinicAvailable}
                            className={cn(baseClass, classFor(clinicAvailable))}
                          >
                            <Building2 className="w-4 h-4" /> Book Clinic Visit
                          </button>
                        )}
                        {offersVideo && (
                          <button
                            type="button"
                            onClick={() => { setConsultType("VIDEO"); setScheduleMode("NOW"); setScheduledAt(""); setBookingOpen(true); }}
                            className={cn(baseClass, availableClass)}
                          >
                            <Video className="w-4 h-4" /> Book Video Consultation
                          </button>
                        )}
                        {offersHome && (
                          <button
                            type="button"
                            onClick={() => { setConsultType("HOME"); setScheduleMode("NOW"); setScheduledAt(""); setBookingOpen(true); }}
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

      {confirmBookingOpen && bookingOpen && selectedDoctor && (
        <ConfirmDialog
          icon={CalendarCheck2}
          tone="primary"
          title="Confirm this booking?"
          confirmLabel={`Confirm (₹${fee})`}
          busyLabel="Booking…"
          cancelLabel="Go back"
          busy={booking}
          onCancel={() => setConfirmBookingOpen(false)}
          onConfirm={confirmAndBook}
          message={
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <span>Doctor</span>
                <span className="font-semibold text-slate-700 text-right">{formatDoctorName(selectedDoctor.name)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Consultation</span>
                <span className="font-semibold text-slate-700 text-right">{ALL_TYPES.find((t) => t.id === consultType)?.label}</span>
              </div>
              {consultType === "CLINIC" && selectedClinic && (
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

      {/* ── Empty state: nothing within the search radius ───────────── */}
      {!panelOpen && !pickingOnMap && doctors.length > 0
        && clinicMarkers.length === 0 && searchRadiusKm != null && !ignoreRadius && (
        <div className="absolute bottom-[calc(9rem_+_var(--safe-area-inset-bottom,env(safe-area-inset-bottom)))] lg:bottom-24 inset-x-0 z-20 flex justify-center px-4 pointer-events-none">
          <div className="glass-card rounded-2xl px-4 py-2.5 flex items-center gap-2 text-xs shadow border border-amber-200 pointer-events-auto max-w-full">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-slate-600 truncate">No clinics within {searchRadiusKm} km of {customLabel ?? "here"}.</span>
            <button onClick={() => setIgnoreRadius(true)} className="font-semibold text-blue-600 flex-shrink-0">Show all</button>
          </div>
        </div>
      )}

      {/* ── Tap hint (shown when no panel is open) ──────────────────── */}
      {/* Sits clear above the "clinics nearby" badge — on phones the two
          floating chips used to collide at the bottom edge. */}
      {!panelOpen && !pickingOnMap && clinicMarkers.length > 0 && (
        <div className="absolute bottom-[calc(9rem_+_var(--safe-area-inset-bottom,env(safe-area-inset-bottom)))] lg:bottom-24 inset-x-0 z-20 flex justify-center pointer-events-none">
          <div className="glass-card rounded-full px-4 py-2 flex items-center gap-2 text-xs text-slate-500 shadow">
            <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            Tap a doctor pin to see details
          </div>
        </div>
      )}

      {/* ── Location picker ─────────────────────────────────────────── */}
      {locationPickerOpen && (
        <div className="absolute inset-0 z-50 flex items-start justify-center p-4 pt-24 bg-black/30" onClick={() => setLocationPickerOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-extrabold text-slate-900">Choose a location</h3>
              <button onClick={() => setLocationPickerOpen(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              {customLabel
                ? <>Showing doctors near <span className="font-semibold text-slate-600">{customLabel}</span>. Booking for someone in another city? Set their area here.</>
                : "Search an area to browse doctors there — e.g. when booking for a relative in another city."}
            </p>

            <AddressAutocomplete
              value={locationQuery}
              onChange={setLocationQuery}
              onSelect={(s) => applyCustomLocation(s.lat, s.lon, s.label.split(",").slice(0, 2).join(",").trim())}
              placeholder="Search city, area or society…"
            />

            <button
              onClick={() => { setLocationPickerOpen(false); setPickingOnMap(true); }}
              className="btn-secondary w-full justify-center py-2.5 mt-3 gap-1.5 text-sm"
            >
              <MapPin className="w-4 h-4" /> Pick an exact spot on the map
            </button>

            <button
              onClick={switchToMyLocation}
              disabled={locatingGps}
              className="w-full justify-center py-2.5 mt-2 gap-1.5 text-sm flex items-center font-semibold text-blue-600 disabled:opacity-60"
            >
              {locatingGps
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Locating…</>
                : <><Crosshair className="w-4 h-4" /> Use my current location</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Pick-on-map mode ───────────────────────────────────────── */}
      {pickingOnMap && (
        <>
          {/* Fixed centre pin */}
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center -mt-6">
              <MapPin className="w-9 h-9 text-blue-600 drop-shadow-lg" fill="#2563eb" fillOpacity={0.25} />
              <div className="w-2 h-2 rounded-full bg-blue-600 -mt-1 shadow" />
            </div>
          </div>
          {/* Top bar */}
          <div className="absolute top-0 inset-x-0 z-50 p-3 pointer-events-none" style={{ paddingTop: "calc(0.75rem + var(--safe-area-inset-top, env(safe-area-inset-top)))" }}>
            <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2 shadow-lg pointer-events-auto">
              <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-700 flex-1">Move the map to the location</span>
              <button onClick={() => setPickingOnMap(false)} className="text-sm font-semibold text-slate-400">Cancel</button>
            </div>
          </div>
          {/* Confirm button */}
          <div className="absolute bottom-0 inset-x-0 z-50 p-4 pointer-events-none" style={{ paddingBottom: "calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)))" }}>
            <button
              onClick={confirmMapPick}
              disabled={confirmingPick}
              className="btn-primary w-full justify-center py-3.5 text-base pointer-events-auto disabled:opacity-70"
            >
              {confirmingPick ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting…</> : "Set this location"}
            </button>
          </div>
        </>
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
