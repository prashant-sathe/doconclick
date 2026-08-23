"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { startRingingAlert } from "@/lib/playNotificationSound";

export interface WalletTxnEvent {
  id: string;
  type: string; // TOPUP, BOOKING_PAYMENT, ADMIN_CREDIT, ADMIN_DEBIT
  status: string; // SUCCESS, FAILED — PENDING rows aren't notable yet
  amount: number;
  balanceAfter: number | null;
  note: string | null;
}

type RawTxn = WalletTxnEvent & { createdAt: string };

const POLL_MS = 5000;
const seenKey = (patientId: string) => `doconclick_wallet_seen_${patientId}`;

function loadSeenMap(patientId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(patientId)) ?? "{}");
  } catch {
    return {};
  }
}

// Mirrors usePatientNotifications' poll/diff/seen-map shape, but for wallet
// transactions instead of appointment status changes. A transaction never
// changes status once SUCCESS/FAILED, so "seen" is a simple id→status map
// rather than the appointment hook's event-diffing.
export function useWalletNotifications(patientId: string | undefined) {
  const [balance, setBalance] = useState<number | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTxnEvent[]>([]);
  const [hasUnseen, setHasUnseen] = useState(false);
  const [activeToast, setActiveToast] = useState<WalletTxnEvent | null>(null);
  const lastKnownIds = useRef<Set<string> | null>(null);
  const stopRingingRef = useRef<(() => void) | null>(null);

  const stopRinging = useCallback(() => {
    stopRingingRef.current?.();
    stopRingingRef.current = null;
  }, []);

  const computeUnseen = useCallback((events: WalletTxnEvent[]) => {
    if (!patientId) return false;
    const seen = loadSeenMap(patientId);
    return events.some((e) => seen[e.id] !== e.status);
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    lastKnownIds.current = null;

    const poll = async () => {
      const res = await fetch("/api/wallet/me?take=10").catch(() => null);
      if (!res?.ok) return;
      const data = await res.json();
      setBalance(data.balance ?? 0);

      const notable: WalletTxnEvent[] = (data.transactions as RawTxn[])
        .filter((t) => t.status !== "PENDING");
      setWalletTransactions(notable);
      setHasUnseen(computeUnseen(notable));

      if (lastKnownIds.current === null) {
        lastKnownIds.current = new Set(notable.map((t) => t.id));
        return;
      }
      const newTxn = notable.find((t) => !lastKnownIds.current!.has(t.id));
      if (newTxn) {
        setActiveToast(newTxn);
        stopRingingRef.current?.();
        stopRingingRef.current = startRingingAlert();
      }
      for (const t of notable) lastKnownIds.current.add(t.id);
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
    for (const t of walletTransactions) seen[t.id] = t.status;
    localStorage.setItem(seenKey(patientId), JSON.stringify(seen));
    setHasUnseen(false);
    stopRinging();
  }, [patientId, walletTransactions, stopRinging]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
    stopRinging();
  }, [stopRinging]);

  return { balance, walletTransactions, hasUnseen, activeToast, dismissToast, markSeen };
}
