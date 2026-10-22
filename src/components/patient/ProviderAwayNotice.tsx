"use client";
import { CalendarOff } from "lucide-react";

export type ProviderAvailability = {
  awayNow?: boolean;
  awayUntil?: string | null; // last day off (YYYY-MM-DD), or "today" for offline
  timeOff?: { startDate: string; endDate: string }[];
};

const day = (ymd: string) =>
  new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const range = (a: string, b: string) => (a === b ? day(a) : `${day(a)} – ${day(b)}`);

// On the booking forms: the provider is away right now (so "Book Now" is
// off), and/or which upcoming days are blocked (src/lib/timeOff.ts). The
// booking API refuses those days regardless; this just says so up front.
export default function ProviderAwayNotice({ provider, who = "doctor" }: { provider: ProviderAvailability | null | undefined; who?: "doctor" | "nurse" }) {
  if (!provider) return null;
  const upcoming = (provider.timeOff ?? []).slice(0, 3);
  if (!provider.awayNow && upcoming.length === 0) return null;
  return (
    <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3">
      <CalendarOff className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
      <div>
        {provider.awayNow && (
          <p className="font-semibold">
            {provider.awayUntil === "today" || !provider.awayUntil
              ? `This ${who} isn't taking bookings for the rest of today — schedule a later day.`
              : `This ${who} is on leave until ${day(provider.awayUntil)} — schedule a day after that.`}
          </p>
        )}
        {upcoming.length > 0 && (
          <p className={provider.awayNow ? "mt-0.5" : ""}>
            Not available: {upcoming.map((t) => range(t.startDate, t.endDate)).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
