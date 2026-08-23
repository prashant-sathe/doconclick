"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LayoutDashboard, IndianRupee, UserCircle, Building2, LogOut, Bell, Clock } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn, formatDoctorName } from "@/lib/utils";
import { useDoctorNotifications } from "@/hooks/useDoctorNotifications";
import NotificationToast from "@/components/doctor/NotificationToast";

const NAV = [
  { href: "/doctor/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/doctor/earnings", label: "Earnings", icon: IndianRupee },
  { href: "/doctor/clinics", label: "Clinics", icon: Building2 },
  { href: "/doctor/profile", label: "Profile", icon: UserCircle },
];

function patientLabelFor(r: { patientName: string | null; relation: string; patient: { name: string } }): string {
  return r.relation !== "Self" && r.patientName ? r.patientName : r.patient.name;
}

export default function DoctorHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [bellOpen, setBellOpen] = useState(false);
  const { pendingRequests, hasUnseen, activeToast, dismissToast, markSeen } = useDoctorNotifications(user?.id);

  const toggleBell = () => {
    setBellOpen((open) => {
      if (!open) markSeen();
      return !open;
    });
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/doctor/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <img src="/logo-icon.png" alt="DocOnClick" className="w-8 h-8 object-contain" />
          <span className="font-extrabold text-slate-900 hidden sm:inline">DocOnClick</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors",
                pathname === href ? "text-teal-600 bg-teal-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-slate-500 hidden sm:inline">
            Hi, <strong className="text-slate-800">{user && formatDoctorName(user.name)}</strong>
          </span>

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
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white rounded-2xl border border-slate-100 shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800">Pending Requests</h3>
                  </div>
                  {pendingRequests.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No pending requests.</p>
                  ) : (
                    <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                      {pendingRequests.slice(0, 5).map((r) => (
                        <button
                          key={r.id}
                          onClick={() => { setBellOpen(false); router.push("/doctor/dashboard"); }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <p className="text-sm font-semibold text-slate-800">{patientLabelFor(r)}</p>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{r.symptoms}</p>
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  <Link
                    href="/doctor/dashboard"
                    onClick={() => setBellOpen(false)}
                    className="block text-center text-xs font-semibold text-teal-600 hover:bg-teal-50 py-2.5 border-t border-slate-100"
                  >
                    View all in Dashboard
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

      {activeToast && <NotificationToast request={activeToast} onDismiss={dismissToast} />}
    </header>
  );
}
