"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Festival } from "@/lib/festive";

// A light festive layer over every page while a festival is on (the server
// decides — src/lib/festive.ts): a thin marigold-and-mango-leaf toran along the
// top edge (below the status bar in the app) and a one-time greeting. Purely
// decorative — no layout change, never takes a tap.

// One toran tile, 48×12: the string, two marigolds, a mango leaf between them.
const TORAN_TILE = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="12" viewBox="0 0 48 12">` +
    `<path d="M0 2.2 Q12 4.6 24 2.2 T48 2.2" fill="none" stroke="#B45309" stroke-width=".8"/>` +
    `<circle cx="6" cy="3.4" r="3" fill="#F97316"/><circle cx="6" cy="3.4" r="1.3" fill="#FDBA74"/>` +
    `<circle cx="30" cy="3.4" r="3" fill="#FBBF24"/><circle cx="30" cy="3.4" r="1.3" fill="#FDE68A"/>` +
    `<path d="M18 3.2 C16 6.4 16.6 9.6 18 11.6 C19.4 9.6 20 6.4 18 3.2 Z" fill="#15803D"/>` +
    `<path d="M42 3.2 C40 6.4 40.6 9.6 42 11.6 C43.4 9.6 44 6.4 42 3.2 Z" fill="#16A34A"/>` +
    `</svg>`,
);

const GREETING_KEY = "doconclick_festive_greeted";
// Where decoration would get in the way.
const HIDDEN_ON = [/\/video(\/|$)/];

export default function FestiveDecor({ festival }: { festival: Festival }) {
  const t = useTranslations("shared.festive");
  const pathname = usePathname() ?? "";
  const [greeting, setGreeting] = useState(false);

  useEffect(() => {
    // Once per device per festival, a few seconds after the page settles.
    const key = `${GREETING_KEY}:${festival}`;
    let seen = true;
    try { seen = localStorage.getItem(key) === "1"; } catch { /* storage blocked */ }
    if (seen) return;
    const show = setTimeout(() => {
      setGreeting(true);
      try { localStorage.setItem(key, "1"); } catch { /* storage blocked */ }
    }, 1200);
    const hide = setTimeout(() => setGreeting(false), 6500);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [festival]);

  if (HIDDEN_ON.some((re) => re.test(pathname))) return null;

  return (
    <div className="print:hidden">
      <div
        aria-hidden
        className="fixed inset-x-0 z-[60] pointer-events-none h-3"
        style={{
          top: "var(--safe-area-inset-top, env(safe-area-inset-top))",
          backgroundImage: `url("data:image/svg+xml,${TORAN_TILE}")`,
          backgroundRepeat: "repeat-x",
          backgroundSize: "48px 12px",
        }}
      />
      {greeting && (
        <div className="fixed inset-x-0 bottom-28 lg:bottom-8 z-[60] flex justify-center px-4 pointer-events-none animate-fade-in-up" role="status">
          <button
            type="button"
            onClick={() => setGreeting(false)}
            className="pointer-events-auto rounded-full bg-white/95 backdrop-blur border border-amber-200 shadow-lg px-4 py-2.5 text-sm font-semibold text-amber-900 flex items-center gap-2"
          >
            <span aria-hidden>🪔</span>
            <span>{t(`${festival}.greeting`)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
