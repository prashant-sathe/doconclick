"use client";
import { useEffect, useState } from "react";

const POLL_MS = 3000;
// Consecutive failed polls before the page shows a (non-blocking) warning.
const WARN_AFTER_FAILURES = 3;

/**
 * Polls GET /api/appointments/[id] for the video-call pages. Once the
 * appointment has loaded, a failed poll (network blip, a 5xx) keeps the last
 * good copy instead of replacing the page — which would unmount a live call.
 * `error` is only set when nothing has loaded yet; `connectionWarning` after
 * a few failures in a row while something has.
 */
export function useVideoAppointment<T>(appointmentId: string, enabled: boolean) {
  const [appt, setAppt] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [connectionWarning, setConnectionWarning] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let loaded = false;
    let failures = 0;

    const fail = (message: string) => {
      if (cancelled) return;
      failures += 1;
      if (!loaded) setError(message);
      else if (failures >= WARN_AFTER_FAILURES) setConnectionWarning(true);
    };
    const load = async () => {
      try {
        const r = await fetch(`/api/appointments/${appointmentId}`);
        if (!r.ok) return fail((await r.json().catch(() => ({}))).error ?? "Could not load this appointment.");
        const data = (await r.json()) as T;
        if (cancelled) return;
        loaded = true;
        failures = 0;
        setAppt(data);
        setError("");
        setConnectionWarning(false);
      } catch {
        fail("Could not load this appointment. Check your connection.");
      }
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [appointmentId, enabled]);

  return { appt, error, connectionWarning };
}
