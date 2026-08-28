"use client";
import { type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";

/**
 * Page chrome for the full-screen auth flows (register, and anything else
 * entered from the sign-in screen).
 *
 * Web: the marketing <Navbar> with its collapsible menu.
 * Native app: the hamburger menu is meaningless in the app shell, so show a
 * plain Back button instead (goes to `backHref`, the sign-in screen by
 * default — that's where these flows are entered from).
 *
 * SSR always renders the web branch (no `window`); the swap happens after
 * mount once hydration has safely committed — same approach the login screen
 * uses to hide its "← Home" link.
 */
export default function AuthPageShell({
  backHref = "/login",
  children,
}: {
  backHref?: string;
  children: ReactNode;
}) {
  const native = useIsNativeApp();

  return (
    <div className="min-h-screen gradient-surface">
      {native ? (
        <div className="safe-top sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100">
          <div className="px-3 py-2.5">
            <Link href={backHref} className="btn-ghost gap-1.5 text-sm">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
          </div>
        </div>
      ) : (
        <Navbar />
      )}

      <div
        className={
          native
            ? "px-6 pt-6 pb-[calc(4rem_+_var(--safe-area-inset-bottom,env(safe-area-inset-bottom)))]"
            : "px-6 pt-[calc(7rem_+_var(--safe-area-inset-top,env(safe-area-inset-top)))] pb-[calc(4rem_+_var(--safe-area-inset-bottom,env(safe-area-inset-bottom)))]"
        }
      >
        {children}
      </div>
    </div>
  );
}
