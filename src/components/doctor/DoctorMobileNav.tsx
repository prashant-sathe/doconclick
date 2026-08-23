"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, IndianRupee, Building2, UserCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeDoctorCompleteness } from "@/lib/doctorProfileCompleteness";

const TABS = [
  { href: "/doctor/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/doctor/earnings", label: "Earnings", icon: IndianRupee },
  { href: "/doctor/clinics", label: "Clinics", icon: Building2 },
  { href: "/doctor/support", label: "Support", icon: Sparkles },
  { href: "/doctor/profile", label: "Profile", icon: UserCircle },
];

export default function DoctorMobileNav() {
  const pathname = usePathname();
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  useEffect(() => {
    fetch("/api/doctors/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.doctorProfile) {
          const hasClinic = (d.clinics?.length ?? 0) > 0;
          setProfileIncomplete(computeDoctorCompleteness({ ...d.doctorProfile, hasClinic }).percent < 100);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
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
                {label}
                <span className="text-[7px] font-extrabold tracking-wide text-white gradient-primary rounded-full px-1 py-[1px] leading-none">
                  AI
                </span>
              </span>
            ) : (
              label
            )}
          </Link>
        );
      })}
    </nav>
  );
}
