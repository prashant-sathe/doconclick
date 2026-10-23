"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { CalendarCheck2, UserCircle, Bell, Bookmark, Sparkles, HeartPulse, Wallet as WalletIcon } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn, formatProviderName } from "@/lib/utils";
import { usePatientNotifications } from "@/hooks/usePatientNotifications";
import { useWalletNotifications } from "@/hooks/useWalletNotifications";
import { useAnnouncementNotifications } from "@/hooks/useAnnouncementNotifications";
import { useTranslations } from "next-intl";
import PatientNotificationToast from "@/components/patient/PatientNotificationToast";
import WalletNotificationToast from "@/components/patient/WalletNotificationToast";

// Labels are message keys (messages/<locale>/nav.json).
const WALLET_EVENTS = ["TOPUP", "BOOKING_PAYMENT", "ADMIN_CREDIT", "ADMIN_DEBIT", "REASSIGNMENT_CREDIT"] as const;
const APPT_EVENTS = ["SCHEDULED", "ON_THE_WAY", "ARRIVED", "COMPLETED", "CANCELLED", "REJECTED", "EXPIRED"] as const;
const isOneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

const NAV = [
  { href: "/patient/dashboard", label: "findDoctor" },
  { href: "/patient/nurse", label: "bookNurse", icon: HeartPulse },
  { href: "/patient/assistant", label: "askAi", icon: Sparkles },
  { href: "/patient/appointments", label: "appointments", icon: CalendarCheck2 },
  { href: "/patient/saved", label: "saved", icon: Bookmark },
  { href: "/patient/profile", label: "profile", icon: UserCircle },
] as const;

const STATUS_DOT: Record<string, string> = {
  SCHEDULED: "bg-emerald-500",
  ON_THE_WAY: "bg-blue-500",
  ARRIVED: "bg-emerald-500",
  COMPLETED: "bg-blue-500",
  CANCELLED: "bg-slate-400",
  REJECTED: "bg-red-500",
  EXPIRED: "bg-amber-500",
};

export default function PatientHeader() {
  const { user } = useAuth();
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [bellOpen, setBellOpen] = useState(false);
  const { notableAppointments, hasUnseen: apptUnseen, activeToast, dismissToast, markSeen } = usePatientNotifications(user?.id);
  const {
    balance,
    walletTransactions,
    hasUnseen: walletUnseen,
    activeToast: walletToast,
    dismissToast: dismissWalletToast,
    markSeen: markWalletSeen,
  } = useWalletNotifications(user?.id);
  const { announcements, hasUnseen: announcementsUnseen, markSeen: markAnnouncementsSeen } = useAnnouncementNotifications(user?.id);
  const hasUnseen = apptUnseen || walletUnseen || announcementsUnseen;

  const toggleBell = () => {
    setBellOpen((open) => {
      if (!open) { markSeen(); markWalletSeen(); markAnnouncementsSeen(); }
      return !open;
    });
  };

  return (
    <header
      className="safe-top sticky z-30 bg-white/90 backdrop-blur-xl border-b border-slate-100"
      style={{ top: "var(--imp-banner-h, 0px)" }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/patient/dashboard" aria-label={t("header.home")} className="tap-44-y flex items-center flex-shrink-0">
          <Image src="/logo.png" alt="DocOnClick" width={431} height={102} className="h-7 sm:h-8 w-auto object-contain" />
        </Link>

        {/* Desktop nav — shown from lg up; below that the fixed bottom
            PatientMobileNav handles navigation (tablet portrait can't fit
            the full row without overflowing the header off-screen). */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map(({ href, label, ...rest }) => { const Icon = "icon" in rest ? rest.icon : null; return (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors",
                pathname === href ? "text-blue-600 bg-blue-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {t(`patient.${label}`)}
            </Link>
          ); })}
        </nav>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-slate-500 hidden xl:inline">
            {t.rich("header.hi", { name: user?.name || t("header.there"), strong: (c) => <strong className="text-slate-800">{c}</strong> })}
          </span>

          <Link
            href="/patient/wallet"
            aria-label={balance != null ? t("header.walletBalance", { balance: balance.toLocaleString("en-IN") }) : t("header.wallet")}
            className="tap-44-y flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors"
          >
            <WalletIcon className="w-3.5 h-3.5" />
            <span>{balance != null ? `₹${balance.toLocaleString("en-IN")}` : "—"}</span>
          </Link>

          <div className="relative">
            <button
              onClick={toggleBell}
              title={t("header.notifications")}
              aria-label={hasUnseen ? t("header.notificationsNew") : t("header.notifications")}
              className="tap-44 relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              <Bell className={cn("w-4 h-4", hasUnseen && "animate-bell-ring")} />
              {hasUnseen && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border border-white" />
              )}
            </button>

            {bellOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white rounded-2xl border border-slate-100 shadow-xl z-40 overflow-hidden max-h-[28rem] overflow-y-auto">
                  <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
                    <h3 className="text-sm font-bold text-slate-800">{t("header.appointmentUpdates")}</h3>
                  </div>
                  {notableAppointments.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">{t("header.noUpdates")}</p>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {notableAppointments.slice(0, 5).map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { setBellOpen(false); router.push("/patient/appointments"); }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-2.5"
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[a.event] ?? "bg-slate-300"}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{formatProviderName(a.doctor.name, a.providerType)}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{isOneOf(APPT_EVENTS, a.event) ? t(`apptEvent.${a.event}`) : a.event} · {a.consultType}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="px-4 py-3 border-b border-t border-slate-100 sticky top-0 bg-white">
                    <h3 className="text-sm font-bold text-slate-800">{t("header.walletSection")}</h3>
                  </div>
                  {walletTransactions.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">{t("header.noWalletActivity")}</p>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {walletTransactions.slice(0, 5).map((tx) => (
                        <button
                          key={tx.id}
                          onClick={() => { setBellOpen(false); router.push("/patient/wallet"); }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-2.5"
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.status === "FAILED" ? "bg-red-500" : "bg-emerald-500"}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {tx.status === "FAILED" ? t("header.topUpFailed") : isOneOf(WALLET_EVENTS, tx.type) ? t(`walletEvent.${tx.type}`) : tx.type}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">{tx.balanceAfter != null ? t("header.walletAmountBalance", { amount: tx.amount, balance: tx.balanceAfter }) : t("header.walletAmount", { amount: tx.amount })}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="px-4 py-3 border-b border-t border-slate-100 sticky top-0 bg-white">
                    <h3 className="text-sm font-bold text-slate-800">{t("header.announcements")}</h3>
                  </div>
                  {announcements.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">{t("header.noAnnouncements")}</p>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {announcements.slice(0, 5).map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setBellOpen(false);
                            const url = a.buttons?.[0]?.url;
                            if (url?.startsWith("/")) router.push(url);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{a.message}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  <Link
                    href="/patient/appointments"
                    onClick={() => setBellOpen(false)}
                    className="block text-center text-xs font-semibold text-blue-600 hover:bg-blue-50 py-2.5 border-t border-slate-100"
                  >
                    {t("header.viewAllAppointments")}
                  </Link>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {activeToast && <PatientNotificationToast event={activeToast} onDismiss={dismissToast} />}
      {walletToast && <WalletNotificationToast event={walletToast} onDismiss={dismissWalletToast} />}
    </header>
  );
}
