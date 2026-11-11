"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { isNative } from "@/lib/platform";

export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.doconclick.app";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 flex-shrink-0" aria-hidden="true">
      <path fill="#34A853" d="M3.6 1.8 13.4 12 3.6 22.2c-.4-.2-.6-.6-.6-1.1V2.9c0-.5.2-.9.6-1.1Z" />
      <path fill="#FBBC04" d="m16.7 15.3-3.3-3.3 3.3-3.3 3.8 2.2c1 .6 1 1.6 0 2.2l-3.8 2.2Z" />
      <path fill="#EA4335" d="M3.6 22.2 13.4 12l3.3 3.3L5 22c-.5.3-1 .4-1.4.2Z" />
      <path fill="#4285F4" d="M3.6 1.8c.4-.2.9-.1 1.4.2l11.7 6.7-3.3 3.3L3.6 1.8Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 flex-shrink-0 fill-current" aria-hidden="true">
      <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.8-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.6-1-2.6-4.1ZM13.9 5c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z" />
    </svg>
  );
}

/**
 * "Get it on Google Play" + "App Store — coming soon" badges for the public
 * website. Hidden inside the native app shell (the user already has the app).
 */
export default function AppStoreBadges({ className = "" }: { className?: string }) {
  const t = useTranslations("public.appDownload");
  const [native, setNative] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- isNative() is client-only; must run after mount to avoid hydration mismatch
  useEffect(() => setNative(isNative()), []);
  if (native) return null;

  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("playAria")}
        className="inline-flex items-center gap-3 rounded-xl bg-black text-white border border-white/20 px-4 py-2 min-h-12 hover:bg-slate-800 transition-colors shadow-lg"
      >
        <PlayIcon />
        <span className="flex flex-col leading-tight text-left">
          <span className="text-[10px] uppercase tracking-wide opacity-80">{t("playPre")}</span>
          <span className="text-base font-semibold">Google Play</span>
        </span>
      </a>
      <div
        aria-label={t("appleAria")}
        aria-disabled="true"
        className="relative inline-flex items-center gap-3 rounded-xl bg-black/60 text-white/70 border border-white/20 px-4 py-2 min-h-12 cursor-not-allowed select-none"
      >
        <AppleIcon />
        <span className="flex flex-col leading-tight text-left">
          <span className="text-[10px] uppercase tracking-wide opacity-80">{t("applePre")}</span>
          <span className="text-base font-semibold">App Store</span>
        </span>
        <span className="absolute -top-3 -right-3 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold px-2 py-0.5 shadow">
          {t("comingSoon")}
        </span>
      </div>
    </div>
  );
}
