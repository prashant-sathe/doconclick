"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Stethoscope, Users, CalendarCheck,
  DollarSign, MessageCircle, Settings, Tag,
  LogOut, ChevronRight, FileBarChart, Wallet, Megaphone, TicketPercent,
  Menu, X, HeartPulse, ClipboardList, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import InboxButton from "@/components/InboxButton";
import { useInboxUnread } from "@/hooks/useInboxUnread";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const topItems: NavItem[] = [
  { href: "/admin",            label: "Overview",    icon: LayoutDashboard },
  { href: "/admin/inbox",      label: "Notifications", icon: Inbox },
  { href: "/admin/doctors",    label: "Doctors",     icon: Stethoscope },
  { href: "/admin/specialties", label: "Specialties", icon: Tag },
  { href: "/admin/nurses",     label: "Nurses",      icon: HeartPulse },
  { href: "/admin/nurse-services", label: "Nurse Services", icon: ClipboardList },
  { href: "/admin/patients",   label: "Patients",    icon: Users },
  { href: "/admin/bookings",   label: "Bookings",    icon: CalendarCheck },
];

// Everything that moves or configures money, under one heading.
const moneyItems: NavItem[] = [
  { href: "/admin/finance",    label: "Finance",     icon: DollarSign },
  { href: "/admin/wallets",    label: "Wallets",     icon: Wallet },
  { href: "/admin/coupons",    label: "Coupons",     icon: TicketPercent },
];

const bottomItems: NavItem[] = [
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/reports",    label: "Reports",     icon: FileBarChart },
  { href: "/admin/complaints", label: "Complaints",  icon: MessageCircle },
  { href: "/admin/settings",   label: "Settings",    icon: Settings },
];

// Shared nav list markup — used by both the always-visible desktop rail and
// the slide-in mobile/tablet drawer, so the two never drift apart.
function SidebarContents({ pathname, user, logout, onNavigate, inboxUnread }: {
  pathname: string;
  user: { name?: string; mobile?: string } | null;
  logout: () => void;
  onNavigate?: () => void;
  inboxUnread: number;
}) {
  const renderItem = ({ href, label, icon: Icon }: NavItem) => {
      // Sub-pages count too (/admin/settings/admins → Settings); Overview
      // (/admin) only on itself, or it would match every page.
      const isActive = href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
      return (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={cn("sidebar-item", isActive && "active")}
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{label}</span>
          {href === "/admin/inbox" && inboxUnread > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {inboxUnread > 99 ? "99+" : inboxUnread}
            </span>
          )}
          {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
        </Link>
      );
  };
  return (
    <>
      <div className="px-6 py-5 border-b border-slate-200/70">
        <div className="flex items-center gap-2.5">
          <Image src="/logo-icon.png" alt="DocOnClick" width={512} height={512} className="w-9 h-9 object-contain" />
          <div>
            <div className="font-bold text-slate-900 leading-tight">DocOnClick</div>
            <div className="text-xs text-slate-400 font-medium">Admin Panel</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {topItems.map(renderItem)}
        <div className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Money</div>
        {moneyItems.map(renderItem)}
        <div className="pt-2 space-y-1">{bottomItems.map(renderItem)}</div>
      </nav>

      <div className="px-3 py-4 border-t border-slate-200/70 space-y-2">
        <Link
          href="/admin/profile"
          onClick={onNavigate}
          className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/60 border border-slate-200/60 hover:bg-white transition-colors", pathname === "/admin/profile" && "ring-1 ring-blue-200")}
        >
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
        </Link>
        <button
          onClick={logout}
          className="sidebar-item w-full text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  // Closed by the drawer's own Link taps (onNavigate) and by its backdrop —
  // no effect syncing this to the route is needed for that common path.
  const [mobileOpen, setMobileOpen] = useState(false);
  const inboxUnread = useInboxUnread(user?.id);

  return (
    <>
      {/* ── Mobile/tablet top bar — the sidebar's only surface below lg ── */}
      <header
        className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center gap-3 px-4 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl"
        style={{ top: "var(--imp-banner-h, 0px)" }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 -ml-1.5 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0"
          title="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Image src="/logo-icon.png" alt="DocOnClick" width={512} height={512} className="w-6 h-6 object-contain flex-shrink-0" />
        <span className="font-bold text-slate-900 text-sm truncate flex-1">Admin Panel</span>
        <InboxButton />
      </header>

      {/* ── Desktop rail — unchanged, just gated behind lg: ─────────────── */}
      <aside
        className="hidden lg:flex w-64 fixed left-0 flex-col border-r border-slate-200/70 bg-slate-50/80 backdrop-blur-xl z-40"
        style={{ top: "var(--imp-banner-h, 0px)", height: "calc(100vh - var(--imp-banner-h, 0px))" }}
      >
        <SidebarContents pathname={pathname} user={user} logout={logout} inboxUnread={inboxUnread} />
      </aside>

      {/* ── Mobile/tablet drawer ─────────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] flex flex-col bg-slate-50 shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 hover:bg-slate-100 shadow-sm z-10"
              title="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContents
              pathname={pathname}
              user={user}
              logout={() => { setMobileOpen(false); logout(); }}
              onNavigate={() => setMobileOpen(false)}
              inboxUnread={inboxUnread}
            />
          </aside>
        </div>
      )}
    </>
  );
}
