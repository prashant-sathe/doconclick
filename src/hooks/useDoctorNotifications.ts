"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startRingingAlert } from "@/lib/playNotificationSound";
import { useAppointmentFeed } from "@/components/AppointmentFeed";

export interface PendingRequest {
  id: string;
  symptoms: string;
  consultType: string;
  patientName: string | null;
  relation: string;
  createdAt: string;
  patient: { name: string };
  serviceName?: string | null; // nurse bookings
  packageId?: string | null;    // nurse multi-visit package
}

const seenKey = (doctorId: string) => `doconclick_notif_seen_${doctorId}`;

export function useDoctorNotifications(doctorId: string | undefined) {
  const [activeToast, setActiveToast] = useState<PendingRequest | null>(null);
  // Bumped by markSeen so hasUnseen re-reads the last-seen time.
  const [seenVersion, setSeenVersion] = useState(0);
  const toastedIds = useRef<Set<string> | null>(null);
  const stopRingingRef = useRef<(() => void) | null>(null);

  const stopRinging = useCallback(() => {
    stopRingingRef.current?.();
    stopRingingRef.current = null;
  }, []);

  // The shared poll in the doctor / nurse layout (src/components/AppointmentFeed.tsx).
  const { items } = useAppointmentFeed<PendingRequest & { status: string }>();

  const pendingRequests = useMemo(() => {
    if (!doctorId || !items) return [];
    // A nurse package is one request however many visits it holds.
    const seenPackages = new Set<string>();
    return items.filter((a) => {
      if (a.status !== "PENDING_APPROVAL") return false;
      if (!a.packageId) return true;
      if (seenPackages.has(a.packageId)) return false;
      seenPackages.add(a.packageId);
      return true;
    });
  }, [doctorId, items]);

  const hasUnseen = useMemo(() => {
    if (!doctorId || pendingRequests.length === 0) return false;
    const lastSeenAt = localStorage.getItem(seenKey(doctorId));
    if (!lastSeenAt) return true;
    return pendingRequests.some((r) => new Date(r.createdAt).getTime() > new Date(lastSeenAt).getTime());
    // seenVersion: re-read localStorage after markSeen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, pendingRequests, seenVersion]);

  // A new account starts a new baseline.
  useEffect(() => {
    toastedIds.current = null;
  }, [doctorId]);

  // Toast + ring for a request that wasn't there on the last poll (the first
  // poll only records the baseline).
  useEffect(() => {
    if (!doctorId || !items) return;
    if (toastedIds.current === null) {
      toastedIds.current = new Set(pendingRequests.map((r) => r.id));
      return;
    }
    const fresh = pendingRequests.find((r) => !toastedIds.current!.has(r.id));
    if (fresh) {
      setActiveToast(fresh);
      stopRingingRef.current?.();
      stopRingingRef.current = startRingingAlert();
    }
    for (const r of pendingRequests) toastedIds.current.add(r.id);
  }, [doctorId, items, pendingRequests]);

  useEffect(() => () => {
    stopRingingRef.current?.();
    stopRingingRef.current = null;
  }, []);

  const markSeen = useCallback(() => {
    if (!doctorId) return;
    localStorage.setItem(seenKey(doctorId), new Date().toISOString());
    setSeenVersion((v) => v + 1);
    stopRinging();
  }, [doctorId, stopRinging]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
    stopRinging();
  }, [stopRinging]);

  return { pendingRequests, hasUnseen, activeToast, dismissToast, markSeen };
}
