"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
}

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629]; // India centroid

// Inline SVG pin, not the default Leaflet marker image — the default icon depends on
// marker-icon.png/marker-shadow.png loading from an external CDN, which is unreliable
// (ad-blockers, offline dev, flaky network) and renders as an invisible/broken marker
// when it fails. Matches the divIcon approach already used on /patient/dashboard.
function pinSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path d="M16 0C7.16 0 0 7.16 0 16c0 10 16 24 16 24s16-14 16-24C32 7.16 24.84 0 16 0z" fill="#dc2626" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="7" fill="white" opacity="0.95"/>
    <circle cx="16" cy="16" r="3.5" fill="#dc2626"/>
  </svg>`;
}

export default function LocationPickerMap({ lat, lng, onChange, height = 280 }: LocationPickerMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const leafletMapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const lastEmittedRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!mapRef.current || leafletMapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current || leafletMapRef.current) return;

      // A container left initialized by a torn-down instance (StrictMode double
      // mount / async race) would make L.map throw — clear the stale id first.
      const container = mapRef.current as HTMLDivElement & { _leaflet_id?: number };
      if (container._leaflet_id != null) delete container._leaflet_id;

      const start: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;
      const map = L.map(container, { zoomControl: false }).setView(start, lat != null ? 15 : 4);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const icon = L.divIcon({ html: pinSvg(), className: "", iconSize: [32, 40], iconAnchor: [16, 40] });
      const placeMarker = (pos: [number, number]) => {
        if (markerRef.current) {
          markerRef.current.setLatLng(pos);
          return;
        }
        const marker = L.marker(pos, { icon, draggable: true, zIndexOffset: 1000 }).addTo(map);
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          lastEmittedRef.current = { lat: p.lat, lng: p.lng };
          onChangeRef.current(p.lat, p.lng);
        });
        markerRef.current = marker;
      };

      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        placeMarker([e.latlng.lat, e.latlng.lng]);
        lastEmittedRef.current = { lat: e.latlng.lat, lng: e.latlng.lng };
        onChangeRef.current(e.latlng.lat, e.latlng.lng);
      });

      leafletRef.current = L;
      leafletMapRef.current = map;
      if (lat != null && lng != null) placeMarker([lat, lng]);
    })();

    return () => {
      cancelled = true;
      const map = leafletMapRef.current;
      leafletMapRef.current = null;
      markerRef.current = null;
      leafletRef.current = null;
      if (map) {
        // Halt any in-flight pan/zoom animation first — otherwise its queued
        // requestAnimationFrame callback fires after the panes are gone and
        // throws "Cannot read properties of undefined (reading '_leaflet_pos')".
        try { map.stop(); } catch { /* already torn down */ }
        try { map.remove(); } catch { /* already torn down */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external location changes (address search, "use current location") onto the map,
  // but skip the fly animation when the change was just emitted by this component itself
  // (a click/drag) — otherwise every drag would yank the view back to itself.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    if (!L || !map || lat == null || lng == null) return;
    // The map may have been torn down (card unmounted after a save re-keys it)
    // between this render and this effect — bail before touching Leaflet internals.
    const container = map.getContainer();
    if (!container || !container.isConnected) return;
    const last = lastEmittedRef.current;
    const isInternal = !!last && Math.abs(last.lat - lat) < 1e-7 && Math.abs(last.lng - lng) < 1e-7;

    try {
      if (!markerRef.current) {
        const icon = L.divIcon({ html: pinSvg(), className: "", iconSize: [32, 40], iconAnchor: [16, 40] });
        const marker = L.marker([lat, lng], { icon, draggable: true, zIndexOffset: 1000 }).addTo(map);
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          lastEmittedRef.current = { lat: p.lat, lng: p.lng };
          onChangeRef.current(p.lat, p.lng);
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng([lat, lng]);
      }

      // setView (no animation) instead of flyTo — an animated pan schedules a
      // requestAnimationFrame loop that throws if the map is removed mid-flight.
      if (!isInternal) map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: false });
    } catch { /* map torn down mid-update */ }
  }, [lat, lng]);

  return (
    <div>
      <div ref={mapRef} style={{ height }} className="w-full rounded-xl overflow-hidden border border-slate-200" />
      <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
        <MapPin className="w-3 h-3 flex-shrink-0" /> Tap the map or drag the pin to fine-tune your exact location.
      </p>
    </div>
  );
}
