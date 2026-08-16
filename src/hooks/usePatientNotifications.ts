"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { startRingingAlert } from "@/lib/playNotificationSound";

export interface AppointmentStatusEvent {
  id: string;
  status: string;
  travelStatus: string;
  consultType: string;
  scheduledAt: string;
  doctor: { name: string };
  event: string;
}

type RawAppointment = { id: string; status: string; travelStatus: string; consultType: string; scheduledAt: string; doctor: { name: string } };

// Each appointment's lifecycle produces a sequence of distinct "events" worth
// notifying the patient about. PENDING_APPROVAL (their own booking action)
// and travelStatus NOT_STARTED (the default, not a real event) are excluded.
function deriveEvent(a: RawAppointment): string | null {
  if (a.status === "REJECTED" || a.status === "EXPIRED" || a.status === "COMPLETED" || a.status === "CANCELLED") {
    return a.status;
  }
  if (a.status === "SCHEDULED") {
    if (a.consultType === "HOME" && a.travelStatus === "ARRIVED") return "ARRIVED";
    if (a.consultType === "HOME" && a.travelStatus === "ON_THE_WAY") return "ON_THE_WAY";
    return "SCHEDULED";
  }
  return null;
}

const POLL_MS = 5000;
const seenKey = (patientId: string) => `doconclick_notif_patient_seen_${patientId}`;

function loadSeenMap(patientId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(patientId)) ?? "{}");
  } catch {
    return {};
  }
}

export function usePatientNotifications(patientId: string | undefined) {
  const [notableAppointments, setNotableAppointments] = useState<AppointmentStatusEvent[]>([]);
  const [hasUnseen, setHasUnseen] = useState(false);
  const [activeToast, setActiveToast] = useState<AppointmentStatusEvent | null>(null);
  const lastKnownEvent = useRef<Map<string, string> | null>(null);
  const stopRingingRef = useRef<(() => void) | null>(null);

  const stopRinging = useCallback(() => {
    stopRingingRef.current?.();
    stopRingingRef.current = null;
  }, []);

  const computeUnseen = useCallback((events: AppointmentStatusEvent[]) => {
    if (!patientId) return false;
    const seen = loadSeenMap(patientId);
    return events.some((e) => seen[e.id] !== e.event);
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    lastKnownEvent.current = null;

    const poll = async () => {
      const res = await fetch("/api/appointments/me").catch(() => null);
      if (!res?.ok) return;
      const all: RawAppointment[] = await res.json();
      const notable = all
        .map((a) => ({ ...a, event: deriveEvent(a) }))
        .filter((a): a is AppointmentStatusEvent => a.event !== null);
      setNotableAppointments(notable);
      setHasUnseen(computeUnseen(notable));

      if (lastKnownEvent.current === null) {
        lastKnownEvent.current = new Map(notable.map((a) => [a.id, a.event]));
        return;
      }
      const changed = notable.find((a) => lastKnownEvent.current!.get(a.id) !== a.event);
      if (changed) {
        setActiveToast(changed);
        stopRingingRef.current?.();
        stopRingingRef.current = startRingingAlert();
      }
      for (const a of notable) lastKnownEvent.current.set(a.id, a.event);
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(interval);
      stopRingingRef.current?.();
      stopRingingRef.current = null;
    };
  }, [patientId, computeUnseen]);

  const markSeen = useCallback(() => {
    if (!patientId) return;
    const seen: Record<string, string> = {};
    for (const a of notableAppointments) seen[a.id] = a.event;
    localStorage.setItem(seenKey(patientId), JSON.stringify(seen));
    setHasUnseen(false);
    stopRinging();
  }, [patientId, notableAppointments, stopRinging]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
    stopRinging();
  }, [stopRinging]);

  return { notableAppointments, hasUnseen, activeToast, dismissToast, markSeen };
}
