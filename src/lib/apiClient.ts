"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Client-side helpers so every page handles a failed request the same way:
// - useLoad(): a page's data, keeping the last good copy when a (re)load
//   fails, with an error + reload() for a Retry button (<LoadError>).
// - mutate(): an action (PATCH/POST/DELETE) that checks res.ok and network
//   errors, returning a message ready for toast.error().

/** The server's `error` message from a failed response, or `fallback`. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.error === "string" && body.error) || fallback;
}

export type MutateResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number | null };

/**
 * fetch() for an action. Never throws: `{ ok: false, error }` on a non-2xx
 * response (with the server's message) or a network failure. A plain object
 * `body` is sent as JSON; FormData etc. go through untouched.
 */
export async function mutate<T = unknown>(
  url: string,
  { body, fallback = "Something went wrong. Please try again.", ...init }: Omit<RequestInit, "body"> & { body?: unknown; fallback?: string } = {},
): Promise<MutateResult<T>> {
  const isJson = body !== undefined && !(body instanceof FormData) && !(body instanceof Blob) && typeof body !== "string";
  try {
    const res = await fetch(url, {
      method: "POST",
      ...init,
      headers: { ...(isJson ? { "Content-Type": "application/json" } : {}), ...init.headers },
      body: body === undefined ? undefined : isJson ? JSON.stringify(body) : (body as BodyInit),
    });
    if (!res.ok) return { ok: false, error: await errorMessage(res, fallback), status: res.status };
    return { ok: true, data: (await res.json().catch(() => null)) as T };
  } catch {
    return { ok: false, error: "Network error — check your connection and try again.", status: null };
  }
}

/**
 * Loads `url` (null = don't load yet). `data` keeps the last good result
 * when a reload or poll fails, so a page can show it with an error banner
 * instead of blanking; `loading` is only true until the first success or
 * failure. `reload()` retries (and is what pollMs calls).
 */
export function useLoad<T>(url: string | null, { pollMs, fallback = "Couldn't load this page." }: { pollMs?: number; fallback?: string } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [reloading, setReloading] = useState(false);
  // Only the latest request may update state (a slow old one, or one for a
  // previous url, is ignored).
  const seq = useRef(0);

  // `spin`: show `reloading` (a Retry tap). Mount/poll loads don't — and so
  // set no state before their first await.
  const run = useCallback(async (spin: boolean) => {
    if (!url) return;
    const mine = ++seq.current;
    if (spin) setReloading(true);
    try {
      const res = await fetch(url);
      if (seq.current !== mine) return;
      if (!res.ok) { setError(await errorMessage(res, fallback)); return; }
      const json = (await res.json()) as T;
      if (seq.current !== mine) return;
      setData(json);
      setError(null);
    } catch {
      if (seq.current === mine) setError("Network error — check your connection and try again.");
    } finally {
      if (seq.current === mine) { setLoading(false); setReloading(false); }
    }
  }, [url, fallback]);
  const reload = useCallback(() => run(true), [run]);

  useEffect(() => {
    if (!url) return;
    // Fetching on mount: run(false) only sets state after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run(false);
    if (!pollMs) return;
    const t = setInterval(() => { void run(false); }, pollMs);
    return () => clearInterval(t);
  }, [url, pollMs, run]);

  return { data, setData, error, loading, reloading, reload };
}
