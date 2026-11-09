// Festive theme windows (IST days, inclusive). While one is on, every page of
// the website and app shows its light decoration (src/components/FestiveDecor.tsx);
// outside the window nothing renders. Add next year's dates here.
import { istDayKey } from "@/lib/istDate";

export type Festival = "diwali";

const WINDOWS: { festival: Festival; from: string; to: string }[] = [
  // Diwali 2026 (4–12 Nov) switched off early on request (2026-11-09).
];

/** The festival whose window today (IST) falls in, or null. */
export function activeFestival(now: Date = new Date()): Festival | null {
  const day = istDayKey(now);
  return WINDOWS.find((w) => day >= w.from && day <= w.to)?.festival ?? null;
}
