"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startRingingAlert } from "@/lib/playNotificationSound";
import { useAppointmentFeed } from "@/components/AppointmentFeed";

export interface AppointmentStatusEvent {
  id: string;
  status: string;
  travelStatus: string;
  consultType: string;
  scheduledAt: string;
  providerType?: string; // "NURSE" for nurse bookings
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

const seenKey = (patientId: string) => `doconclick_notif_patient_seen_${patientId}`;

function loadSeenMap(patientId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(patientId)) ?? "{}");
  } catch {
    return {};
  }
}

export function usePatientNotifications(patientId: string | undefined) {
  const [activeToast, setActiveToast] = useState<AppointmentStatusEvent | null>(null);
  // Bumped by markSeen so hasUnseen re-reads the seen map.
  const [seenVersion, setSeenVersion] = useState(0);
  const lastKnownEvent = useRef<Map<string, string> | null>(null);
  const stopRingingRef = useRef<(() => void) | null>(null);

  const stopRinging = useCallback(() => {
    stopRingingRef.current?.();
    stopRingingRef.current = null;
  }, []);

  // The shared poll in the patient layout (src/components/AppointmentFeed.tsx).
  const { items } = useAppointmentFeed<RawAppointment>();

  const notableAppointments = useMemo(
    () => (patientId && items
      ? items.map((a) => ({ ...a, event: deriveEvent(a) })).filter((a): a is AppointmentStatusEvent => a.event !== null)
      : []),
    [patientId, items]
  );

  const hasUnseen = useMemo(() => {
    if (!patientId || notableAppointments.length === 0) return false;
    const seen = loadSeenMap(patientId);
    return notableAppointments.some((e) => seen[e.id] !== e.event);
    // seenVersion: re-read localStorage after markSeen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, notableAppointments, seenVersion]);

  // A new patient starts a new baseline.
  useEffect(() => {
    lastKnownEvent.current = null;
  }, [patientId]);

  // Toast + ring when an appointment reaches a new event since the last poll
  // (the first poll only records the baseline).
  useEffect(() => {
    if (!patientId || !items) return;
    if (lastKnownEvent.current === null) {
      lastKnownEvent.current = new Map(notableAppointments.map((a) => [a.id, a.event]));
      return;
    }
    const changed = notableAppointments.find((a) => lastKnownEvent.current!.get(a.id) !== a.event);
    if (changed) {
      setActiveToast(changed);
      stopRingingRef.current?.();
      stopRingingRef.current = startRingingAlert();
    }
    for (const a of notableAppointments) lastKnownEvent.current.set(a.id, a.event);
  }, [patientId, items, notableAppointments]);

  useEffect(() => () => {
    stopRingingRef.current?.();
    stopRingingRef.current = null;
  }, []);

  const markSeen = useCallback(() => {
    if (!patientId) return;
    const seen: Record<string, string> = {};
    for (const a of notableAppointments) seen[a.id] = a.event;
    localStorage.setItem(seenKey(patientId), JSON.stringify(seen));
    setSeenVersion((v) => v + 1);
    stopRinging();
  }, [patientId, notableAppointments, stopRinging]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
    stopRinging();
  }, [stopRinging]);

  return { notableAppointments, hasUnseen, activeToast, dismissToast, markSeen };
}
