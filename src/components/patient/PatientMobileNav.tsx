"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapPin, CalendarCheck2, UserCircle, Bookmark, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeCompleteness } from "@/lib/profileCompleteness";

const TABS = [
  { href: "/patient/dashboard", label: "Find Doctors", icon: MapPin },
  { href: "/patient/assistant", label: "Assistant", icon: Sparkles },
  { href: "/patient/appointments", label: "Appointments", icon: CalendarCheck2 },
  { href: "/patient/saved", label: "Saved", icon: Bookmark },
  { href: "/patient/profile", label: "Profile", icon: UserCircle },
];

export default function PatientMobileNav() {
  const pathname = usePathname();
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
    <nav
      className="safe-bottom lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-stretch"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold relative",
              active ? "text-blue-600" : "text-slate-400"
            )}
          >
            <span className="relative">
              <Icon className="w-5 h-5" />
              {href === "/patient/profile" && profileIncomplete && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500 border border-white" />
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
