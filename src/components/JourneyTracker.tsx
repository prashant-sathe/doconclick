"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { isNative } from "@/lib/platform";
import { startBackgroundLocationWatch, stopBackgroundLocationWatch } from "@/lib/backgroundLocation";

// Owns the live-location watcher for a doctor's/nurse's home-visit journey.
// Mounted in the doctor and nurse layouts — above the pages — so opening a
// chat or another screen doesn't stop sharing location, and on load it asks
// the server for a journey already ON_THE_WAY and resumes it (after a reload
// or an app restart). Native uses the background watcher (keeps going with
// the app backgrounded); web uses watchPosition (only while a tab is open).
//
// The dashboards still make the first "start journey" request (it can be
// refused outside the start window) and then hand over with track(id).

const SEND_EVERY_MS = 10_000; // ~1 position update / 10s

type JourneyTrackerContextType = {
  /** The visit whose journey is being shared right now, if any. */
  activeId: string | null;
  /**
   * Start (or switch to) sharing location for this visit. `justSent`: the
   * caller just sent a position (the "start journey" request), so wait a
   * full interval before the next; on resume the first fix goes straight out.
   */
  track: (appointmentId: string, opts?: { justSent?: boolean }) => Promise<void>;
  /** Stop sharing location (before "arrived" / "stop journey"). */
  stop: () => Promise<void>;
};

const JourneyTrackerContext = createContext<JourneyTrackerContextType>({
  activeId: null,
  track: async () => {},
  stop: async () => {},
});

export function JourneyTrackerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const webWatchRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  // Throttled with a trailing send: a fix that arrives within the interval
  // isn't dropped — the latest one goes out when the interval is up (else a
  // provider who stops moving right after a send leaves a stale position).
  const pendingRef = useRef<{ lat: number; lng: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatch = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    pendingRef.current = null;
    if (isNative()) {
      await stopBackgroundLocationWatch().catch(() => {});
    } else if (webWatchRef.current != null) {
      navigator.geolocation.clearWatch(webWatchRef.current);
      webWatchRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    activeRef.current = null;
    setActiveId(null);
    await clearWatch();
  }, [clearWatch]);

  const track = useCallback(async (appointmentId: string, opts: { justSent?: boolean } = {}) => {
    if (activeRef.current === appointmentId) return;
    // One journey at a time — and the native helper ignores a second
    // addWatcher, so always clear the old one first.
    await clearWatch();
    activeRef.current = appointmentId;
    setActiveId(appointmentId);
    lastSentRef.current = opts.justSent ? Date.now() : 0;

    const send = async () => {
      const id = activeRef.current;
      const fix = pendingRef.current;
      if (!id || !fix) return;
      pendingRef.current = null;
      lastSentRef.current = Date.now();
      const { lat, lng } = fix;
      const res = await fetch(`/api/appointments/${id}/travel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelStatus: "ON_THE_WAY", lat, lng }),
      }).catch(() => null);
      // A 4xx means the journey is over (arrived / stopped / cancelled —
      // possibly from another device): stop sharing. Network errors and 5xx
      // just retry on the next fix.
      if (res && res.status >= 400 && res.status < 500 && activeRef.current === id) await stop();
    };

    const onMove = (lat: number, lng: number) => {
      if (!activeRef.current) return;
      pendingRef.current = { lat, lng };
      const wait = SEND_EVERY_MS - (Date.now() - lastSentRef.current);
      if (wait <= 0) { void send(); return; }
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => { timerRef.current = null; void send(); }, wait);
      }
    };

    if (isNative()) {
      await startBackgroundLocationWatch(onMove);
    } else if (typeof navigator !== "undefined" && navigator.geolocation) {
      webWatchRef.current = navigator.geolocation.watchPosition(
        (p) => onMove(p.coords.latitude, p.coords.longitude),
        () => {},
        { enableHighAccuracy: true }
      );
    }
  }, [clearWatch, stop]);

  // Resume a journey that's already under way.
  const isProvider = user?.role === "DOCTOR" || user?.role === "NURSE";
  useEffect(() => {
    if (!isProvider) return;
    let cancelled = false;
    fetch("/api/appointments/active-journey")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { id: string | null } | null) => {
        if (!cancelled && d?.id) void track(d.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isProvider, user?.id, track]);

  // Leaving the doctor/nurse area (or signing out) stops sharing.
  useEffect(() => () => { void clearWatch(); }, [clearWatch]);
  useEffect(() => {
    if (!isProvider && activeRef.current) void stop();
  }, [isProvider, stop]);

  return (
    <JourneyTrackerContext.Provider value={{ activeId, track, stop }}>
      {children}
    </JourneyTrackerContext.Provider>
  );
}

export function useJourneyTracker() {
  return useContext(JourneyTrackerContext);
}
