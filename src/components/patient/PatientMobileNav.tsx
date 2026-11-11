"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapPin, CalendarCheck2, UserCircle, Sparkles, HeartPulse } from "lucide-react";
import { computeCompleteness } from "@/lib/profileCompleteness";
import { useTranslations } from "next-intl";
import { FloatingTabBar, tabItemClass } from "@/components/FloatingTabBar";

// Saved doctors moved off the bar into the Profile hub (5 tabs read better
// on small phones); /patient/saved keeps the Profile tab highlighted.
const TABS = [
  { href: "/patient/dashboard", label: "tabDoctors", icon: MapPin },
  { href: "/patient/nurse", label: "tabNurse", icon: HeartPulse },
  { href: "/patient/assistant", label: "tabAssistant", icon: Sparkles },
  { href: "/patient/appointments", label: "appointments", icon: CalendarCheck2 },
  { href: "/patient/profile", label: "profile", icon: UserCircle },
] as const;

export default function PatientMobileNav() {
  const pathname = usePathname();
  const t = useTranslations("nav.patient");
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  useEffect(() => {
    fetch("/api/patients/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.patientProfile) setProfileIncomplete(computeCompleteness(d.patientProfile).percent < 100);
      })
      .catch(() => {});
  }, []);

  return (
    <FloatingTabBar>
      {TABS.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || (href === "/patient/profile" && pathname === "/patient/saved");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={tabItemClass(active)}
          >
            <span className="relative">
              <Icon className="w-5 h-5" />
              {href === "/patient/profile" && profileIncomplete && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500 border border-white" />
              )}
            </span>
            <span className="max-w-full truncate">{t(label)}</span>
          </Link>
        );
      })}
    </FloatingTabBar>
  );
}
