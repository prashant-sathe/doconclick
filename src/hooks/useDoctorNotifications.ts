"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { startRingingAlert } from "@/lib/playNotificationSound";

export interface PendingRequest {
  id: string;
  symptoms: string;
  consultType: string;
  patientName: string | null;
  relation: string;
  createdAt: string;
  patient: { name: string };
}

const POLL_MS = 5000;
const seenKey = (doctorId: string) => `doconclick_notif_seen_${doctorId}`;

export function useDoctorNotifications(doctorId: string | undefined) {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [hasUnseen, setHasUnseen] = useState(false);
  const [activeToast, setActiveToast] = useState<PendingRequest | null>(null);
  const toastedIds = useRef<Set<string> | null>(null);
  const stopRingingRef = useRef<(() => void) | null>(null);

  const stopRinging = useCallback(() => {
    stopRingingRef.current?.();
    stopRingingRef.current = null;
  }, []);

  const computeUnseen = useCallback((requests: PendingRequest[]) => {
    if (!doctorId) return false;
    const lastSeenAt = localStorage.getItem(seenKey(doctorId));
    if (!lastSeenAt) return requests.length > 0;
    return requests.some((r) => new Date(r.createdAt).getTime() > new Date(lastSeenAt).getTime());
  }, [doctorId]);

  useEffect(() => {
    if (!doctorId) return;
    toastedIds.current = null;

    const poll = async () => {
      const res = await fetch("/api/appointments/me").catch(() => null);
      if (!res?.ok) return;
      const all: Array<{ id: string; status: string; symptoms: string; consultType: string; patientName: string | null; relation: string; createdAt: string; patient: { name: string } }> = await res.json();
      const requests = all.filter((a) => a.status === "PENDING_APPROVAL");
      setPendingRequests(requests);
      setHasUnseen(computeUnseen(requests));

      if (toastedIds.current === null) {
        toastedIds.current = new Set(requests.map((r) => r.id));
        return;
      }
      const fresh = requests.find((r) => !toastedIds.current!.has(r.id));
      if (fresh) {
        toastedIds.current.add(fresh.id);
        setActiveToast(fresh);
        stopRingingRef.current?.();
        stopRingingRef.current = startRingingAlert();
      }
      for (const r of requests) toastedIds.current.add(r.id);
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(interval);
      stopRingingRef.current?.();
      stopRingingRef.current = null;
    };
  }, [doctorId, computeUnseen]);

  const markSeen = useCallback(() => {
    if (!doctorId) return;
    localStorage.setItem(seenKey(doctorId), new Date().toISOString());
    setHasUnseen(false);
    stopRinging();
  }, [doctorId, stopRinging]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
    stopRinging();
  }, [stopRinging]);

  return { pendingRequests, hasUnseen, activeToast, dismissToast, markSeen };
}
