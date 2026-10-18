// In-process sliding-window rate limiter. State lives in this server
// process's memory, so it resets on restart and isn't shared across
// instances — fine for the single-container deployment, but it's a speed
// bump, not a substitute for limits enforced in the database.
export function createRateLimiter(max: number, windowMs: number) {
  const log = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const timestamps = (log.get(key) ?? []).filter((t) => now - t < windowMs);
    if (timestamps.length >= max) {
      log.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    log.set(key, timestamps);
    return true;
  };
}

// Like createRateLimiter, but only failures count and a success clears the
// key — so a lockout targets guessing, not a legitimate user who signs in a
// few times a day.
export function createFailureLimiter(max: number, windowMs: number) {
  const log = new Map<string, number[]>();
  const recent = (key: string) => (log.get(key) ?? []).filter((t) => Date.now() - t < windowMs);
  return {
    isBlocked: (key: string) => recent(key).length >= max,
    recordFailure: (key: string) => log.set(key, [...recent(key), Date.now()]),
    reset: (key: string) => log.delete(key),
  };
}

// Client IP for rate limiting. nginx (the only public entry point in prod)
// sets X-Real-IP; without it (local dev) everyone shares one bucket.
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}
