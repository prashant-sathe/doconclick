import { cn } from "@/lib/utils";

/**
 * Floating glass tab bar shared by the patient / doctor / nurse mobile navs
 * (shown below `lg`). A rounded pill inset from the screen edges, floating
 * above the home indicator; the active tab gets a white chip.
 *
 * Height incl. the bottom gap is ~76px + safe area, so content pages keep
 * using `pb-24 lg:pb-10`.
 */
export function FloatingTabBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <nav
      className={cn(
        "lg:hidden fixed inset-x-3 z-30 glass-pill rounded-full p-1.5 flex items-stretch gap-0.5",
        className,
      )}
      style={{ bottom: "calc(0.625rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)))" }}
    >
      {children}
    </nav>
  );
}

/** Class names for one tab link. `accent` = text colour of the active tab. */
export function tabItemClass(active: boolean, accent = "text-emerald-700") {
  return cn(
    "flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap relative transition-colors",
    active ? cn("bg-white shadow-sm", accent) : "text-slate-500 hover:text-slate-800",
  );
}
