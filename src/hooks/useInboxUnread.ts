"use client";
import { useEffect, useState } from "react";
import { INBOX_CHANGED_EVENT } from "@/lib/inbox";

const POLL_MS = 30000;

// Unread inbox count for the header badge. Polls slowly; a push received in
// the foreground, a mark-read, or the app coming back to the foreground
// refetches right away (see src/lib/inbox.ts).
export function useInboxUnread(userId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const res = await fetch("/api/notifications/unread-count").catch(() => null);
      if (!res?.ok || cancelled) return;
      const data = await res.json().catch(() => null);
      if (!cancelled && typeof data?.count === "number") setCount(data.count);
    };
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };

    void load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener(INBOX_CHANGED_EVENT, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(INBOX_CHANGED_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  return count;
}
