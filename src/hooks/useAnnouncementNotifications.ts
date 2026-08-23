"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  bannerImageUrl: string | null;
  buttons: { label: string; url: string }[] | null;
  seen: boolean;
}

const POLL_MS = 5000;

// "Seen" is tracked server-side (AnnouncementRecipient.seenAt), unlike the
// appointment/wallet notification hooks which use a localStorage seen-map —
// announcements need cross-device state and admin-visible read stats.
export function useAnnouncementNotifications(userId: string | undefined) {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const poll = async () => {
      const res = await fetch("/api/announcements/bell").catch(() => null);
      if (!res?.ok) return;
      setAnnouncements(await res.json());
    };

    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [userId]);

  const hasUnseen = announcements.some((a) => !a.seen);

  const markSeen = useCallback(() => {
    const unseenIds = announcements.filter((a) => !a.seen).map((a) => a.id);
    if (unseenIds.length === 0) return;
    setAnnouncements((prev) => prev.map((a) => ({ ...a, seen: true })));
    fetch("/api/announcements/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unseenIds }),
    }).catch(() => {});
  }, [announcements]);

  return { announcements, hasUnseen, markSeen };
}
