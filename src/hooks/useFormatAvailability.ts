"use client";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { formatAvailability } from "@/lib/availability";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const isDay = (d: string): d is (typeof DAYS)[number] => (DAYS as readonly string[]).includes(d);

/**
 * formatAvailability() with the day names in the app's language
 * ("Mon–Sat, 8 AM–8 PM" → "सोम–शनि, 8 AM–8 PM"). Times keep Latin digits and
 * AM/PM, like slot times everywhere else in the app.
 */
export function useFormatAvailability() {
  const t = useTranslations("booking.common.days");
  return useCallback(
    (availability: string | null | undefined) =>
      formatAvailability(availability, { dayLabel: (d) => (isDay(d) ? t(d) : d) }),
    [t],
  );
}
