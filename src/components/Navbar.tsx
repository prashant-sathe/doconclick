"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Heart, Menu, X, LogIn, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/20 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-md">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xl font-extrabold text-slate-900 leading-none tracking-tight">DocOnClick</span>
            <div className="text-[10px] font-semibold text-slate-400 tracking-wide uppercase leading-none mt-0.5">Healthcare Platform</div>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
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
        <div className="hidden md:flex items-center gap-2">
          <Link href="/login" className="btn-ghost gap-1.5">
            <LogIn className="w-4 h-4" /> Sign In
          </Link>
          <Link href="/patient/register" className="btn-primary gap-1.5">
            <UserPlus className="w-4 h-4" /> Register Free
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setOpen(v => !v)} className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-slate-100 bg-white px-6 py-4 space-y-1">
          {navLinks.map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className={cn("block px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                pathname === href ? "text-blue-600 bg-blue-50" : "text-slate-700 hover:bg-slate-50"
              )}>
              {label}
            </Link>
          ))}
          <div className="pt-3 flex flex-col gap-2">
            <Link href="/login" onClick={() => setOpen(false)} className="btn-secondary justify-center">Sign In</Link>
            <Link href="/patient/register" onClick={() => setOpen(false)} className="btn-primary justify-center">Register Free</Link>
          </div>
        </div>
      )}
    </nav>
  );
}
