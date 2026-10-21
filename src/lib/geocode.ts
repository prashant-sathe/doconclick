import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rateLimit";

// Shared plumbing for the /api/geocode/* proxies to OpenStreetMap Nominatim.
// Nominatim's usage policy: a real User-Agent, at most 1 request/second for
// the whole app, and cache results. So: signed-in users only, a per-user
// limit, a shared in-process cache (with in-flight de-duplication), and
// upstream calls spaced 1s apart through one queue. All in this process's
// memory — fine for the single-container deployment.

const USER_AGENT = "DocOnClick/1.0 (healthcare booking app)";
const UPSTREAM_GAP_MS = 1100;
const MAX_QUEUE = 8; // beyond this a caller gets "busy" rather than waiting ~10s
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 5000;

/** Sign-in + per-user limit. Returns a response to send back, or null to go on. */
export async function geocodeGuard(limiter: (key: string) => boolean): Promise<NextResponse | null> {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!limiter(user.id)) {
    return NextResponse.json({ error: "Too many location lookups — wait a minute and try again." }, { status: 429 });
  }
  return null;
}

export const searchLimiter = createRateLimiter(40, 60_000); // typing, debounced 400ms
export const reverseLimiter = createRateLimiter(20, 60_000); // "use my location", map picks

type Entry = { value: unknown; expires: number };
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

function cacheGet(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Re-insert so the Map's order is least-recently-used first.
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key: string, value: unknown) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

export class GeocodeBusyError extends Error {}

let queue: Promise<void> = Promise.resolve();
let queued = 0;
let lastCall = 0;

/** Fetch JSON from Nominatim, one request at a time, ≥1.1s apart. */
function upstream<T>(url: URL): Promise<T> {
  if (queued >= MAX_QUEUE) return Promise.reject(new GeocodeBusyError());
  queued++;
  const run = queue.then(async () => {
    const wait = lastCall + UPSTREAM_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    // No query in the log — it's someone's address.
    console.log(`geocode upstream: ${url.pathname}`);
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return (await res.json()) as T;
  });
  queue = run.then(() => undefined, () => undefined).finally(() => { queued--; });
  return run;
}

/** Cached lookup. Only successful answers are cached; a failure throws. */
export async function cachedLookup<T>(key: string, url: URL, shape: (raw: unknown) => T): Promise<T> {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit as T;
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const p = upstream<unknown>(url)
    .then((raw) => {
      const value = shape(raw);
      cacheSet(key, value);
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
