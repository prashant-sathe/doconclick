"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, IndianRupee, UserCircle, LogOut, Bell } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn, formatProviderName } from "@/lib/utils";
import { useDoctorNotifications } from "@/hooks/useDoctorNotifications";
import NotificationToast from "@/components/doctor/NotificationToast";
import InboxButton from "@/components/InboxButton";
import { useTranslations } from "next-intl";

const NAV = [
  { href: "/nurse/dashboard", label: "visits", icon: LayoutDashboard },
  { href: "/nurse/earnings", label: "earnings", icon: IndianRupee },
  { href: "/nurse/profile", label: "profile", icon: UserCircle },
] as const;

// Same shell pattern as DoctorHeader/DoctorMobileNav: desktop nav from lg,
// fixed bottom tab bar below that (pages use `pb-24 lg:pb-10`).
export function NurseHeader() {
  const { user, logout } = useAuth();
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  // Same poll + toast + ringing alert doctors get — a request expires in
  // 30 minutes, so a nurse who isn't staring at the dashboard must still hear it.
  const { pendingRequests, hasUnseen, activeToast, dismissToast, markSeen } = useDoctorNotifications(user?.id);

  return (
    <header
      className="safe-top sticky z-30 bg-white/90 backdrop-blur-xl border-b border-slate-100"
      style={{ top: "var(--imp-banner-h, 0px)" }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/nurse/dashboard" className="flex items-center flex-shrink-0">
          <Image src="/logo.png" alt="DocOnClick" width={431} height={102} className="h-7 sm:h-8 w-auto object-contain" />
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors",
                pathname === href ? "text-rose-600 bg-rose-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}
            >
              <Icon className="w-4 h-4" />
              {t(`nurse.${label}`)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-slate-500 hidden xl:inline">
            {user && t.rich("header.hi", { name: formatProviderName(user.name, "NURSE"), strong: (c) => <strong className="text-slate-800">{c}</strong> })}
          </span>
          <InboxButton />
          <button
            onClick={() => { markSeen(); router.push("/nurse/dashboard"); }}
            title={t("nurse.visitRequests")}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
          >
            <Bell className={cn("w-4 h-4", hasUnseen && "animate-bell-ring")} />
            {pendingRequests.length > 0 && (
              <span className={cn("absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center border border-white", hasUnseen ? "bg-red-500 text-white" : "bg-slate-200 text-slate-600")}>
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={logout}
            title={t("header.signOut")}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      {activeToast && <NotificationToast request={activeToast} onDismiss={dismissToast} href="/nurse/dashboard" />}
    </header>
  );
}

export function NurseMobileNav() {
  const pathname = usePathname();
  const t = useTranslations("nav.nurse");
  return (
    <nav className="safe-bottom lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-stretch">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold",
            pathname === href ? "text-rose-600" : "text-slate-400"
          )}
        >
          <Icon className="w-5 h-5" />
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}
