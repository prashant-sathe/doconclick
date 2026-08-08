"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, CalendarCheck2, UserCircle, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/patient/dashboard", label: "Find a Doctor" },
  { href: "/patient/appointments", label: "Appointments", icon: CalendarCheck2 },
  { href: "/patient/profile", label: "Profile", icon: UserCircle },
];

export default function PatientHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/patient/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow">
            <Heart className="w-4 h-4 text-white" />
          </div>
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
            Hi, <strong className="text-slate-800">{user?.name?.split(" ")[0]}</strong>
          </span>
          <button onClick={logout} className="btn-ghost gap-1.5 text-sm text-red-500 hover:text-red-600 px-2.5 sm:px-3.5">
            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
