"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * App-wide "you're offline" strip. Inside the Capacitor WebView a dropped
 * connection otherwise just leaves half-loaded screens with no explanation;
 * this at least tells the user why. `navigator.onLine` + the online/offline
 * events work in both the Android WebView and iOS WKWebView. No-ops on the
 * server and whenever the connection is fine.
 */
export function OfflineBanner() {
  const t = useTranslations("shared.offline");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setInterval> | undefined;

    // `navigator.onLine` can be stuck at false on some desktop browsers
    // (VPN / virtual adapters), so only trust "offline" once a real request
    // to our own server also fails.
    const probe = async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal });
        clearTimeout(timer);
        return res.ok;
      } catch {
        return false;
      }
    };

    const update = async () => {
      if (navigator.onLine) {
        clearInterval(retry);
        retry = undefined;
        if (!cancelled) setOffline(false);
        return;
      }
      const reachable = await probe();
      if (cancelled) return;
      setOffline(!reachable);
      // While the banner is up, keep re-checking — the "online" event may
      // never fire if the browser's flag is the thing that's wrong.
      if (!reachable && !retry) retry = setInterval(update, 15000);
      if (reachable) { clearInterval(retry); retry = undefined; }
    };

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      cancelled = true;
      clearInterval(retry);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // The banner covers the status-bar area with a dark strip — flip the native
  // status-bar icons to light while it's up, and back when it clears.
  useEffect(() => {
    if (!offline) return;
    let reverted = false;
    import("@capacitor/status-bar")
      .then(({ StatusBar, Style }) => { if (!reverted) return StatusBar.setStyle({ style: Style.Dark }); })
      .catch(() => {});
    return () => {
      reverted = true;
      import("@capacitor/status-bar")
        .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Light }))
        .catch(() => {});
    };
  }, [offline]);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="safe-top fixed inset-x-0 top-0 z-[80] bg-slate-900 text-white text-xs font-medium px-4 py-2 flex items-center justify-center gap-2 shadow-md"
    >
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
      {t("message")}
    </div>
  );
}
