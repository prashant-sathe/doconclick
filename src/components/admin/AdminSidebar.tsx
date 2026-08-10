"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Stethoscope, Users, CalendarCheck,
  DollarSign, MessageCircle, Settings, Heart,
  LogOut, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";

const navItems = [
  { href: "/admin",            label: "Overview",    icon: LayoutDashboard },
  { href: "/admin/doctors",    label: "Doctors",     icon: Stethoscope },
  { href: "/admin/patients",   label: "Patients",    icon: Users },
  { href: "/admin/bookings",   label: "Bookings",    icon: CalendarCheck },
  { href: "/admin/finance",    label: "Finance",     icon: DollarSign },
  { href: "/admin/complaints", label: "Complaints",  icon: MessageCircle },
  { href: "/admin/settings",   label: "Settings",    icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="h-screen w-64 fixed left-0 top-0 flex flex-col border-r border-slate-200/70 bg-slate-50/80 backdrop-blur-xl z-40">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-200/70">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-lg">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900 leading-tight">DocOnClick</div>
            <div className="text-xs text-slate-400 font-medium">Admin Panel</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn("sidebar-item", isActive && "active")}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-slate-200/70 space-y-2">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/60 border border-slate-200/60">
          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">
              {user?.name?.charAt(0).toUpperCase() ?? "A"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate">
              {user?.name ?? "Admin"}
            </div>
            <div className="text-xs text-slate-400 truncate">{user?.mobile ?? "—"}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="sidebar-item w-full text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
