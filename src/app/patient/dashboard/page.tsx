"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin, Home, Building2, Video, Stethoscope, Clock,
  ChevronDown, X, Loader2, CheckCircle, LogOut, Star,
  Navigation, AlertCircle, IndianRupee,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

// ── Types ──────────────────────────────────────────────────────────────────
interface DoctorProfile {
  specialty: string;
  experience: number;
  consultFee: number;
  homeVisitFee: number;
  availability: string;
  radius: number;
  lat: number | null;
  lng: number | null;
  qualification: string;
}

interface Doctor {
  id: string;
  name: string;
  doctorProfile: DoctorProfile | null;
  distance?: number; // km, computed client-side
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

// ── Specialty colour map ───────────────────────────────────────────────────
const SPEC_COLOR: Record<string, string> = {
  "General Physician": "#2563eb",
  Pediatrician: "#16a34a",
  Dermatologist: "#9333ea",
  Cardiologist: "#dc2626",
  Gynaecologist: "#db2777",
  "Orthopaedic Surgeon": "#ea580c",
  Neurologist: "#0891b2",
  "ENT Specialist": "#ca8a04",
};

function specColor(specialty: string) {
  return SPEC_COLOR[specialty] ?? "#2563eb";
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
const TYPES = [
  { id: "HOME", label: "Home Visit", icon: Home },
  { id: "CLINIC", label: "Clinic Visit", icon: Building2 },
  { id: "VIDEO", label: "Video Call", icon: Video },
];

// ══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function PatientDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();

  // State
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [posError, setPosError] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [consultType, setConsultType] = useState("HOME");
  const [symptoms, setSymptoms] = useState("");
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<{ id: string; fee: number } | null>(null);
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

  // ── Compute distances whenever userPos or doctors change ───────────────
  const doctorsWithDist = doctors.map((d) => {
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
  });

  const sorted = [...doctorsWithDist].sort(
    (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
  );
  const nearest = sorted[0];

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
    const docList = doctorsWithDist;
    const nearestId = nearest?.id;

    docList.forEach((doc) => {
      if (!doc.doctorProfile?.lat || !doc.doctorProfile?.lng) return;
      const color = specColor(doc.doctorProfile.specialty);
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
          setConsultType("HOME");
          setSymptoms("");
          setBooked(null);
        });

      markersRef.current.set(doc.id, marker);
    });
  }, [doctorsWithDist, nearest?.id]);

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

  // ── Re-place markers when doctors list changes ─────────────────────────
  useEffect(() => {
    if (!leafletMapRef.current) return;
    placeDoctorMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors]);

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

  // ── Redirect unauthenticated ───────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
    if (!authLoading && user && user.role !== "PATIENT") router.push("/login");
  }, [authLoading, user, router]);

  // ── Booking submit ─────────────────────────────────────────────────────
  const submitBooking = async () => {
    if (!user?.id || !selectedDoctor) return;
    setBooking(true);
    const fee =
      consultType === "HOME"
        ? selectedDoctor.doctorProfile?.homeVisitFee ?? 0
        : selectedDoctor.doctorProfile?.consultFee ?? 0;

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: user.id,
        doctorId: selectedDoctor.id,
        symptoms,
        consultType,
        amount: fee,
      }),
    });
    const data = await res.json();
    setBooking(false);
    if (res.ok) setBooked({ id: data.id, fee });
  };

  const fee =
    consultType === "HOME"
      ? selectedDoctor?.doctorProfile?.homeVisitFee ?? 0
      : selectedDoctor?.doctorProfile?.consultFee ?? 0;

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
        <div className="flex items-start justify-between p-4 gap-3">
          {/* Logo / title */}
          <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto shadow-lg">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">DocOnClick</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {posError ? "📍 Default location" : "📍 Your location"}
              </p>
            </div>
          </div>

          {/* Right: user + logout */}
          <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto shadow-lg">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-900 leading-none">{user?.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">Patient</p>
            </div>
            <button
              onClick={logout}
              className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Nearest doctor badge (top-center) ──────────────────────── */}
      {nearest?.doctorProfile && (
        <div className="absolute top-20 inset-x-0 z-20 flex justify-center pointer-events-none">
          <button
            onClick={() => { setSelectedDoctor(nearest); setPanelOpen(true); setBookingOpen(false); }}
            className="glass-card rounded-2xl px-4 py-2.5 flex items-center gap-3 pointer-events-auto shadow-lg hover:scale-105 transition-transform"
          >
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: specColor(nearest.doctorProfile.specialty) }}
            />
            <span className="text-xs font-semibold text-slate-700">
              Nearest: <span className="text-blue-600">{nearest.name}</span>
              {nearest.distance != null && (
                <span className="text-slate-400 font-normal ml-1">
                  · {nearest.distance.toFixed(1)} km
                </span>
              )}
            </span>
            <Navigation className="w-3.5 h-3.5 text-blue-500" />
          </button>
        </div>
      )}

      {/* ── Legend ─────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 left-4 z-20 pointer-events-none">
        <div className="glass-card rounded-2xl p-3 flex flex-col gap-1.5 max-w-[170px]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Specialties</p>
          {Object.entries(SPEC_COLOR).slice(0, 5).map(([spec, color]) => (
            <div key={spec} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-slate-600 leading-none">{spec}</span>
            </div>
          ))}
          <p className="text-[9px] text-slate-400 mt-1">Tap a pin to book</p>
        </div>
      </div>

      {/* ── Doctor count badge ──────────────────────────────────────── */}
      <div className="absolute bottom-6 right-4 z-20 pointer-events-none">
        <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2 pointer-events-auto">
          <Stethoscope className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-slate-700">
            {doctors.filter((d) => d.doctorProfile?.lat).length} doctors nearby
          </span>
        </div>
      </div>

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
            className="absolute bottom-0 inset-x-0 z-40 rounded-t-3xl overflow-hidden"
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
                  <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                    <CheckCircle className="w-9 h-9 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900">Booking Confirmed!</h3>
                    <p className="text-slate-500 text-sm mt-1">Your {consultType === "HOME" ? "home visit" : "appointment"} is scheduled.</p>
                    <p className="text-xs text-slate-400 font-mono mt-2">ID: {booked.id.slice(0, 14)}…</p>
                  </div>
                  <button
                    onClick={() => router.push(`/patient/payment?amount=${booked.fee}&apptId=${booked.id}`)}
                    className="btn-primary w-full justify-center py-3.5 text-base mt-2"
                  >
                    Proceed to Payment ₹{booked.fee}
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
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {TYPES.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setConsultType(id)}
                        className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all ${
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

                  {/* Fee pill */}
                  <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-2.5 mb-4">
                    <IndianRupee className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-700">{fee}</span>
                    <span className="text-xs text-blue-500 ml-1">
                      {consultType === "HOME" ? "Home visit fee" : consultType === "CLINIC" ? "Clinic fee" : "Video fee"}
                    </span>
                  </div>

                  {/* Symptoms */}
                  <label className="input-label">Symptoms / Reason</label>
                  <textarea
                    rows={3}
                    className="input-field resize-none mb-4"
                    placeholder="Describe your symptoms briefly…"
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={() => setBookingOpen(false)}
                      className="btn-secondary flex-1 justify-center py-3"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitBooking}
                      disabled={booking || !symptoms.trim()}
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
                      style={{ background: `linear-gradient(135deg, ${specColor(selectedDoctor.doctorProfile.specialty)}, ${specColor(selectedDoctor.doctorProfile.specialty)}99)` }}
                    >
                      {selectedDoctor.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-extrabold text-slate-900 leading-tight">{selectedDoctor.name}</h3>
                      <p className="text-sm text-slate-500 mt-0.5">{selectedDoctor.doctorProfile.specialty}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{selectedDoctor.doctorProfile.qualification}</p>
                      {/* Mock stars */}
                      <div className="flex items-center gap-1 mt-1.5">
                        {[1, 2, 3, 4].map((s) => (
                          <Star key={s} className="w-3 h-3 fill-amber-400 text-amber-400" />
                        ))}
                        <Star className="w-3 h-3 text-slate-200 fill-slate-200" />
                        <span className="text-[10px] text-slate-400 ml-1">4.2 (48 reviews)</span>
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
                  </div>

                  {/* Fee cards */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                      <Building2 className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                      <p className="text-xs text-slate-500">Clinic Visit</p>
                      <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{selectedDoctor.doctorProfile.consultFee}</p>
                    </div>
                    <div className="rounded-2xl p-4 border border-blue-200 bg-blue-50 text-center">
                      <Home className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                      <p className="text-xs text-blue-600">Home Visit</p>
                      <p className="text-base font-extrabold text-blue-700 mt-0.5">₹{selectedDoctor.doctorProfile.homeVisitFee}</p>
                    </div>
                  </div>

                  {/* CTA buttons */}
                  <button
                    onClick={() => { setConsultType("HOME"); setBookingOpen(true); }}
                    className="btn-primary w-full justify-center py-3.5 text-base mb-2.5"
                  >
                    <Home className="w-4 h-4" /> Request Home Visit
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setConsultType("CLINIC"); setBookingOpen(true); }}
                      className="btn-secondary justify-center py-3 text-sm"
                    >
                      <Building2 className="w-4 h-4" /> Clinic Visit
                    </button>
                    <button
                      onClick={() => { setConsultType("VIDEO"); setBookingOpen(true); }}
                      className="btn-secondary justify-center py-3 text-sm"
                    >
                      <Video className="w-4 h-4" /> Video Call
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Tap hint (shown when no panel is open) ──────────────────── */}
      {!panelOpen && doctors.length > 0 && (
        <div className="absolute bottom-24 inset-x-0 z-20 flex justify-center pointer-events-none">
          <div className="glass-card rounded-full px-4 py-2 flex items-center gap-2 text-xs text-slate-500 shadow">
            <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            Tap a doctor pin to see details
          </div>
        </div>
      )}

      {/* ── Location error banner ───────────────────────────────────── */}
      {posError && (
        <div className="absolute top-32 inset-x-0 z-20 flex justify-center pointer-events-none">
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
