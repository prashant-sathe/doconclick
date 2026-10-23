"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, IndianRupee, Building2, UserCircle, Sparkles, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeDoctorCompleteness } from "@/lib/doctorProfileCompleteness";
import { useAuth } from "@/components/AuthProvider";
import { useTranslations } from "next-intl";

const TABS = [
  { href: "/doctor/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/doctor/earnings", label: "earnings", icon: IndianRupee },
  { href: "/doctor/clinics", label: "clinics", icon: Building2 },
  { href: "/doctor/support", label: "support", icon: Sparkles },
  { href: "/doctor/profile", label: "profile", icon: UserCircle },
] as const;

// Staff only manages the queue and books walk-ins — no
// earnings/clinics-edit/support-AI/profile.
const STAFF_TABS = [
  { href: "/doctor/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/doctor/walk-in", label: "walkIn", icon: UserPlus },
] as const;

export default function DoctorMobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useTranslations("nav.doctor");
  const isStaff = user?.role === "STAFF";
  const tabs: readonly { href: string; label: (typeof TABS)[number]["label"] | (typeof STAFF_TABS)[number]["label"]; icon: typeof LayoutDashboard }[] = isStaff ? STAFF_TABS : TABS;
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  useEffect(() => {
    // Wait until the role is known; only a DOCTOR has /api/doctors/me.
    if (user?.role !== "DOCTOR") return;
    fetch("/api/doctors/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.doctorProfile) {
          const hasClinic = (d.clinics?.length ?? 0) > 0;
          setProfileIncomplete(computeDoctorCompleteness({ ...d.doctorProfile, hasClinic }).percent < 100);
        }
      })
      .catch(() => {});
  }, [user?.role]);

  return (
    <nav
      className="safe-bottom lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-stretch"
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold relative",
              active ? "text-teal-600" : "text-slate-400"
            )}
          >
            <span className="relative">
              {href === "/doctor/support" ? (
                <span className="flex items-center justify-center w-6 h-6 rounded-lg gradient-primary shadow-sm shadow-teal-900/20">
                  <Icon className="w-3.5 h-3.5 text-white" />
                </span>
              ) : (
                <Icon className="w-5 h-5" />
              )}
              {href === "/doctor/profile" && profileIncomplete && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500 border border-white" />
              )}
            </span>
            {href === "/doctor/support" ? (
              <span className="flex items-center gap-1">
                {t(label)}
                <span className="text-[7px] font-extrabold tracking-wide text-white gradient-primary rounded-full px-1 py-[1px] leading-none">
                  AI
                </span>
              </span>
            ) : (
              t(label)
            )}
          </Link>
        );
      })}
    </nav>
  );
}
