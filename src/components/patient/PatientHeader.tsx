"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { CalendarCheck2, UserCircle, LogOut, Bell, Bookmark, Sparkles, Wallet as WalletIcon } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn, formatDoctorName } from "@/lib/utils";
import { usePatientNotifications } from "@/hooks/usePatientNotifications";
import { useWalletNotifications } from "@/hooks/useWalletNotifications";
import PatientNotificationToast from "@/components/patient/PatientNotificationToast";
import WalletNotificationToast from "@/components/patient/WalletNotificationToast";

const WALLET_EVENT_LABEL: Record<string, string> = {
  TOPUP: "Wallet topped up",
  BOOKING_PAYMENT: "Wallet debited",
  ADMIN_CREDIT: "Credited by admin",
  ADMIN_DEBIT: "Debited by admin",
};

const NAV = [
  { href: "/patient/dashboard", label: "Find a Doctor" },
  { href: "/patient/assistant", label: "Ask AI", icon: Sparkles },
  { href: "/patient/appointments", label: "Appointments", icon: CalendarCheck2 },
  { href: "/patient/saved", label: "Saved", icon: Bookmark },
  { href: "/patient/profile", label: "Profile", icon: UserCircle },
];

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Confirmed",
  ON_THE_WAY: "On the way",
  ARRIVED: "Arrived",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Declined",
  EXPIRED: "Doctor was busy",
};

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
  const { user, logout } = useAuth();
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
  const hasUnseen = apptUnseen || walletUnseen;

  const toggleBell = () => {
    setBellOpen((open) => {
      if (!open) { markSeen(); markWalletSeen(); }
      return !open;
    });
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/patient/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <img src="/logo-icon.png" alt="DocOnClick" className="w-8 h-8 object-contain" />
          <span className="font-extrabold text-slate-900 hidden sm:inline">DocOnClick</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors",
                pathname === href ? "text-blue-600 bg-blue-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-slate-500 hidden sm:inline">
            Hi, <strong className="text-slate-800">{user?.name}</strong>
          </span>

          <Link
            href="/patient/wallet"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors"
          >
            <WalletIcon className="w-3.5 h-3.5" />
            <span>{balance != null ? `₹${balance.toLocaleString("en-IN")}` : "—"}</span>
          </Link>

          <div className="relative">
            <button
              onClick={toggleBell}
              title="Notifications"
              className="relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
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
                    <h3 className="text-sm font-bold text-slate-800">Appointment Updates</h3>
                  </div>
                  {notableAppointments.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No updates yet.</p>
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
                            <p className="text-sm font-semibold text-slate-800 truncate">{formatDoctorName(a.doctor.name)}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{STATUS_LABEL[a.event] ?? a.event} · {a.consultType}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="px-4 py-3 border-b border-t border-slate-100 sticky top-0 bg-white">
                    <h3 className="text-sm font-bold text-slate-800">Wallet</h3>
                  </div>
                  {walletTransactions.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No wallet activity yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {walletTransactions.slice(0, 5).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { setBellOpen(false); router.push("/patient/wallet"); }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-2.5"
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === "FAILED" ? "bg-red-500" : "bg-emerald-500"}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {t.status === "FAILED" ? "Top-up failed" : (WALLET_EVENT_LABEL[t.type] ?? t.type)}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">₹{t.amount}{t.balanceAfter != null ? ` · Balance ₹${t.balanceAfter}` : ""}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <Link
                    href="/patient/appointments"
                    onClick={() => setBellOpen(false)}
                    className="block text-center text-xs font-semibold text-blue-600 hover:bg-blue-50 py-2.5 border-t border-slate-100"
                  >
                    View all appointments
                  </Link>
                </div>
              </>
            )}
          </div>

          <button onClick={logout} className="btn-ghost gap-1.5 text-sm text-red-500 hover:text-red-600 px-2.5 sm:px-3.5">
            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {activeToast && <PatientNotificationToast event={activeToast} onDismiss={dismissToast} />}
      {walletToast && <WalletNotificationToast event={walletToast} onDismiss={dismissWalletToast} />}
    </header>
  );
}
