"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { startRingingAlert } from "@/lib/playNotificationSound";

export interface AppointmentStatusEvent {
  id: string;
  status: string;
  consultType: string;
  scheduledAt: string;
  doctor: { name: string };
}

// Status changes worth notifying the patient about — not the initial
// PENDING_APPROVAL creation, since that's their own booking action.
const NOTABLE_STATUSES = new Set(["SCHEDULED", "REJECTED", "EXPIRED", "COMPLETED", "CANCELLED"]);

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
  const lastKnownStatus = useRef<Map<string, string> | null>(null);
  const stopRingingRef = useRef<(() => void) | null>(null);

  const stopRinging = useCallback(() => {
    stopRingingRef.current?.();
    stopRingingRef.current = null;
  }, []);

  const computeUnseen = useCallback((events: AppointmentStatusEvent[]) => {
    if (!patientId) return false;
    const seen = loadSeenMap(patientId);
    return events.some((e) => seen[e.id] !== e.status);
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    lastKnownStatus.current = null;

    const poll = async () => {
      const res = await fetch("/api/appointments/me").catch(() => null);
      if (!res?.ok) return;
      const all: Array<{ id: string; status: string; consultType: string; scheduledAt: string; doctor: { name: string } }> = await res.json();
      const notable = all.filter((a) => NOTABLE_STATUSES.has(a.status));
      setNotableAppointments(notable);
      setHasUnseen(computeUnseen(notable));

      if (lastKnownStatus.current === null) {
        lastKnownStatus.current = new Map(notable.map((a) => [a.id, a.status]));
        return;
      }
      const changed = notable.find((a) => lastKnownStatus.current!.get(a.id) !== a.status);
      if (changed) {
        setActiveToast(changed);
        stopRingingRef.current?.();
        stopRingingRef.current = startRingingAlert();
      }
      for (const a of notable) lastKnownStatus.current.set(a.id, a.status);
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
    for (const a of notableAppointments) seen[a.id] = a.status;
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
