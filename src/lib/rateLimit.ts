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
