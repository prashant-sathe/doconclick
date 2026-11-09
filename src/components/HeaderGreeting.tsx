"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

// Hour of day on the device, read only on the client: the server has no idea
// what time it is for the user, so SSR renders without the line (null) and
// the client fills it in, with no hydration mismatch.
const subscribe = () => () => {};
const getHour = () => new Date().getHours();
const getServerHour = () => null;

function initials(name: string) {
  const parts = name.replace(/^dr\.?\s*/i, "").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
}

/**
 * Avatar + "Hi, Name" + "Good morning", the left part of the floating glass
 * header (like the map screen's header). `href` is where tapping the avatar goes.
 */
export default function HeaderGreeting({ name, href, className }: { name: string | null | undefined; href: string; className?: string }) {
  const t = useTranslations("nav.header");
  const hour = useSyncExternalStore(subscribe, getHour, getServerHour);
  const timeLine = hour == null ? " " : hour < 12 ? t("goodMorning") : hour < 17 ? t("goodAfternoon") : t("goodEvening");
  const display = name?.trim() || t("there");

  return (
    <Link href={href} className={`flex items-center gap-2.5 min-w-0 ${className ?? ""}`}>
      <span className="w-10 h-10 rounded-full gradient-primary text-white text-sm font-bold flex items-center justify-center flex-shrink-0 ring-2 ring-white shadow-sm">
        {initials(display)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm text-slate-900 truncate">
          {t.rich("hi", { name: display, strong: (c) => <strong className="font-bold">{c}</strong> })}
        </span>
        <span className="block text-xs text-emerald-700/80 truncate">{timeLine}</span>
      </span>
    </Link>
  );
}
