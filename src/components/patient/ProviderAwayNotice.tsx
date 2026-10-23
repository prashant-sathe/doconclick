"use client";
import { CalendarOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

export type ProviderAvailability = {
  awayNow?: boolean;
  awayUntil?: string | null; // last day off (YYYY-MM-DD), or "today" for offline
  timeOff?: { startDate: string; endDate: string }[];
};

const day = (ymd: string, locale: string) =>
  new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const range = (a: string, b: string, locale: string) => (a === b ? day(a, locale) : `${day(a, locale)} – ${day(b, locale)}`);

// On the booking forms: the provider is away right now (so "Book Now" is
// off), and/or which upcoming days are blocked (src/lib/timeOff.ts). The
// booking API refuses those days regardless; this just says so up front.
export default function ProviderAwayNotice({ provider, who = "doctor" }: { provider: ProviderAvailability | null | undefined; who?: "doctor" | "nurse" }) {
  const t = useTranslations("booking.away");
  const locale = formattingLocale(useLocale());
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
              ? t("awayToday", { who })
              : t("onLeave", { who, date: day(provider.awayUntil, locale) })}
          </p>
        )}
        {upcoming.length > 0 && (
          <p className={provider.awayNow ? "mt-0.5" : ""}>
            {t("notAvailable", { ranges: upcoming.map((o) => range(o.startDate, o.endDate, locale)).join(", ") })}
          </p>
        )}
      </div>
    </div>
  );
}
