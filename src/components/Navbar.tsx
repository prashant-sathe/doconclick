"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X, LogIn, UserPlus, LogOut, LayoutDashboard } from "lucide-react";
import { cn, formatDoctorName } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { ROLE_HOME } from "@/lib/roleHome";
import LanguageSwitch from "@/components/LanguageSwitch";

const NAV_LINKS = [
  { href: "/", key: "home" },
  { href: "/about", key: "about" },
  { href: "/contact", key: "contact" },
] as const;

export default function Navbar() {
  const t = useTranslations("public.navbar");
  const pathname = usePathname();
  const navLinks = NAV_LINKS.map(({ href, key }) => ({ href, label: t(key) }));
  const [open, setOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const dashboardHref = user ? ROLE_HOME[user.role] ?? "/" : "/";
  const displayName = user ? (user.role === "DOCTOR" ? formatDoctorName(user.name) : user.name || user.mobile) : "";

  return (
    <nav className="safe-top fixed top-0 inset-x-0 z-50 border-b border-white/20 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-3 xl:gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center flex-shrink-0">
          <Image src="/logo.png" alt="DocOnClick" width={1200} height={242} className="h-9 w-auto" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-1">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-2.5 xl:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200",
                pathname === href
                  ? "text-blue-600 bg-blue-50 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden lg:flex items-center gap-2">
          <LanguageSwitch compact />
          {loading ? null : user ? (
            <>
              <Link href={dashboardHref} className="btn-ghost gap-1.5">
                <LayoutDashboard className="w-4 h-4" /> {displayName}
              </Link>
              <button onClick={logout} className="btn-primary gap-1.5">
                <LogOut className="w-4 h-4" /> {t("signOut")}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost gap-1.5">
                <LogIn className="w-4 h-4" /> <span className="whitespace-nowrap">{t("signIn")}</span>
              </Link>
              <Link href="/patient/register" className="btn-primary gap-1.5">
                <UserPlus className="w-4 h-4" /> {t("registerFree")}
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button aria-label={open ? t("closeMenu") : t("openMenu")} aria-expanded={open} onClick={() => setOpen(v => !v)} className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden border-t border-slate-100 bg-white px-6 py-4 space-y-1">
          {navLinks.map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className={cn("block px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                pathname === href ? "text-blue-600 bg-blue-50" : "text-slate-700 hover:bg-slate-50"
              )}>
              {label}
            </Link>
          ))}
          <div className="pt-3">
            <LanguageSwitch compact />
          </div>
          <div className="pt-3 flex flex-col gap-2">
            {loading ? null : user ? (
              <>
                <Link href={dashboardHref} onClick={() => setOpen(false)} className="btn-secondary justify-center">
                  {t("dashboardOf", { name: displayName })}
                </Link>
                <button
                  onClick={() => { setOpen(false); logout(); }}
                  className="btn-primary justify-center"
                >
                  {t("signOut")}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setOpen(false)} className="btn-secondary justify-center">{t("signIn")}</Link>
                <Link href="/patient/register" onClick={() => setOpen(false)} className="btn-primary justify-center">{t("registerFree")}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
