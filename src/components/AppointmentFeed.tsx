"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthProvider";
import { useResync } from "@/hooks/useResync";
import { errorMessage } from "@/lib/apiClient";

// One poll of /api/appointments/me?view=active per signed-in screen
// (BUG-TRACKER #55). Mounted in the patient / doctor / nurse layouts, above
// the header and the page, so the notification bell and the page share it
// instead of each fetching the whole history every 5s. Pages that show past
// visits page through ?view=history with useAppointmentHistory() and merge
// the two with mergeAppointments().

const POLL_MS = 5000;

type FeedContextType = {
  /** Live + recent appointments as the API returns them; null until the first load. */
  items: unknown[] | null;
  /** The last poll's error (the last good `items` stay). */
  error: string | null;
  /** Fetch now (after a mutation, a Retry tap). */
  refresh: () => Promise<void>;
};

const FeedContext = createContext<FeedContextType | null>(null);

export function AppointmentFeedProvider({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const t = useTranslations("shared.feed");
  // On the id/role, not the `user` object — AuthProvider re-polls every 30s with a fresh one.
  const userId = user?.id ?? null;
  const enabled = !!userId && roles.includes(user?.role ?? "");
  const [items, setItems] = useState<unknown[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may update state.
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const mine = ++seq.current;
    try {
      const res = await fetch("/api/appointments/me?view=active");
      if (seq.current !== mine) return;
      if (!res.ok) { setError(await errorMessage(res, t("loadFailed"))); return; }
      const data = (await res.json()) as unknown[];
      if (seq.current !== mine) return;
      setItems(data);
      setError(null);
    } catch {
      if (seq.current === mine) setError(t("networkError"));
    }
  }, [enabled, t]);

  useEffect(() => {
    // A different user (or signed out): drop the last one's list.
    seq.current++;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(null);
    setError(null);
    if (!enabled) return;
    void refresh();
    // Skipped while the tab/app is hidden; useResync catches up on return.
    const t = setInterval(() => { if (document.visibilityState !== "hidden") void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [enabled, userId, refresh]);

  // WebViews suspend timers in the background — refetch on resume/reconnect.
  useResync(() => { void refresh(); });

  const value = useMemo(() => ({ items, error, refresh }), [items, error, refresh]);
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

const NO_FEED: FeedContextType = { items: null, error: null, refresh: async () => {} };

/** The shared live/recent appointments (see AppointmentFeedProvider). */
export function useAppointmentFeed<T>() {
  const ctx = useContext(FeedContext) ?? NO_FEED;
  return ctx as Omit<FeedContextType, "items"> & { items: T[] | null };
}

type HistoryPage<T> = { items: T[]; nextCursor: string | null; counts: Record<string, number> };

/** Finished appointments, newest first, a page at a time (?view=history). */
export type HistoryQuery = { q?: string; status?: string; consultType?: string; clinicId?: string; from?: string; to?: string };

export function useAppointmentHistory<T extends { id: string }>(enabled: boolean, { pageSize = 20, query }: { pageSize?: number; query?: HistoryQuery } = {}) {
  const t = useTranslations("shared.feed");
  // Search / filters run on the server, over the whole history.
  const queryKey = JSON.stringify(Object.entries(query ?? {}).filter(([, v]) => v).sort());
  const [items, setItems] = useState<T[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);
  const loaded = useRef(0);

  const fetchPage = async (cursor: string | null): Promise<HistoryPage<T>> => {
    const qs = new URLSearchParams({ view: "history", limit: String(pageSize) });
    for (const [k, v] of JSON.parse(queryKey) as [string, string][]) qs.set(k, v);
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`/api/appointments/me?${qs}`);
    if (!res.ok) throw new Error(await errorMessage(res, t("historyLoadFailed")));
    return res.json();
  };
  const failure = (e: unknown) => (e instanceof TypeError ? t("networkError") : (e as Error).message);

  /** Re-fetch from the top, as many pages as were showing (after a mutation). */
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const mine = ++seq.current;
    try {
      const want = Math.max(loaded.current, pageSize);
      let page = await fetchPage(null);
      const all = [...page.items];
      while (all.length < want && page.nextCursor) {
        page = await fetchPage(page.nextCursor);
        all.push(...page.items);
      }
      if (seq.current !== mine) return;
      loaded.current = all.length;
      setItems(all);
      setNextCursor(page.nextCursor);
      setCounts(page.counts);
      setError(null);
    } catch (e) {
      if (seq.current === mine) setError(failure(e));
    }
    // fetchPage only reads pageSize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pageSize, queryKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const mine = ++seq.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextCursor);
      if (seq.current !== mine) return;
      setItems((cur) => {
        const seen = new Set((cur ?? []).map((a) => a.id));
        const merged = [...(cur ?? []), ...page.items.filter((a) => !seen.has(a.id))];
        loaded.current = merged.length;
        return merged;
      });
      setNextCursor(page.nextCursor);
      setCounts(page.counts);
      setError(null);
    } catch (e) {
      if (seq.current === mine) setError(failure(e));
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore, pageSize, queryKey]);

  useEffect(() => {
    loaded.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { items, nextCursor, hasMore: nextCursor !== null, counts, error, loadingMore, loadMore, refresh };
}

/** Live/recent feed + loaded history, one row per id (the feed's copy is newer). */
export function mergeAppointments<T extends { id: string }>(feed: T[] | null, history: T[] | null): T[] {
  const byId = new Map<string, T>();
  for (const a of history ?? []) byId.set(a.id, a);
  for (const a of feed ?? []) byId.set(a.id, a);
  return [...byId.values()];
}
