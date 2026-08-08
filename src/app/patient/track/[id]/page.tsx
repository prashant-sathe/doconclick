"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Car, MapPinCheck, Clock, Navigation, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { estimateArrivalMinutes } from "@/lib/eta";

interface TrackedAppointment {
  id: string;
  status: string;
  consultType: string;
  travelStatus: string;
  doctorLat: number | null;
  doctorLng: number | null;
  doctor: { name: string; doctorProfile: { specialty: string } | null };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function PatientTrackDoctor() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [appt, setAppt] = useState<TrackedAppointment | null>(null);
  const [error, setError] = useState("");
  const [patientPos, setPatientPos] = useState<[number, number] | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<import("leaflet").Map | null>(null);
  const doctorMarkerRef = useRef<import("leaflet").Marker | null>(null);
  const patientMarkerRef = useRef<import("leaflet").Marker | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
    if (!authLoading && user && user.role !== "PATIENT") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setPatientPos([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const load = useCallback(() => {
    fetch(`/api/appointments/${params.id}`)
      .then(async (r) => {
        if (!r.ok) { setError((await r.json()).error ?? "Could not load this appointment."); return; }
        setAppt(await r.json());
      });
  }, [params.id]);

  useEffect(() => {
    if (!user || user.role !== "PATIENT") return;
    load();
    const interval = setInterval(() => {
      if (appt?.travelStatus === "ON_THE_WAY") load();
    }, 5000);
    return () => clearInterval(interval);
  }, [user, load, appt?.travelStatus]);

  // Init / update map whenever we have both positions
  useEffect(() => {
    if (!mapRef.current || !patientPos || appt?.doctorLat == null || appt?.doctorLng == null) return;
    const doctorPos: [number, number] = [appt.doctorLat, appt.doctorLng];

    const setup = async () => {
      const L = (await import("leaflet")).default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!leafletMapRef.current) {
        const map = L.map(mapRef.current!, { center: doctorPos, zoom: 14, zoomControl: false });
        L.control.zoom({ position: "bottomright" }).addTo(map);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors", maxZoom: 19,
        }).addTo(map);
        leafletMapRef.current = map;

        const patientIcon = L.divIcon({
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,0.25)"></div>`,
          className: "", iconSize: [14, 14], iconAnchor: [7, 7],
        });
        patientMarkerRef.current = L.marker(patientPos, { icon: patientIcon, zIndexOffset: 900 }).addTo(map);

        const doctorIcon = L.divIcon({
          html: `<div style="font-size:26px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3))">🚗</div>`,
          className: "", iconSize: [30, 30], iconAnchor: [15, 15],
        });
        doctorMarkerRef.current = L.marker(doctorPos, { icon: doctorIcon, zIndexOffset: 1000 }).addTo(map);

        map.fitBounds(L.latLngBounds([patientPos, doctorPos]), { padding: [60, 60] });
      } else {
        doctorMarkerRef.current?.setLatLng(doctorPos);
      }
    };
    setup();
  }, [patientPos, appt?.doctorLat, appt?.doctorLng]);

  if (authLoading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>;
  }

  const distance = patientPos && appt?.doctorLat != null && appt?.doctorLng != null
    ? haversine(patientPos[0], patientPos[1], appt.doctorLat, appt.doctorLng)
    : null;
  const eta = distance != null ? estimateArrivalMinutes(distance) : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} className="absolute inset-0 z-0" />

      <div className="absolute top-4 left-4 z-20">
        <Link href="/patient/appointments" className="glass-card rounded-xl px-3 py-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 shadow-lg">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>

      {error ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="glass-card rounded-2xl p-6 text-center text-slate-500 max-w-sm">{error}</div>
        </div>
      ) : !appt ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        </div>
      ) : appt.doctorLat == null ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="glass-card rounded-2xl p-6 text-center text-slate-500 max-w-sm">
            Waiting for {appt.doctor.name} to start their journey…
          </div>
        </div>
      ) : (
        <div className="absolute bottom-6 inset-x-0 z-20 flex justify-center px-4">
          <div className="glass-card rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
                {appt.travelStatus === "ARRIVED" ? <MapPinCheck className="w-5 h-5 text-white" /> : <Car className="w-5 h-5 text-white" />}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{appt.doctor.name}</p>
                <p className="text-xs text-slate-500">{appt.doctor.doctorProfile?.specialty}</p>
              </div>
            </div>
            {appt.travelStatus === "ARRIVED" ? (
              <p className="text-sm font-semibold text-emerald-600">Your doctor has arrived.</p>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Navigation className="w-3.5 h-3.5 text-blue-500" /> {distance?.toFixed(1)} km away
                </span>
                <span className="flex items-center gap-1.5 font-bold text-teal-600">
                  <Clock className="w-3.5 h-3.5" /> ~{eta} min
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
