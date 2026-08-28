"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * App-wide "you're offline" strip. Inside the Capacitor WebView a dropped
 * connection otherwise just leaves half-loaded screens with no explanation;
 * this at least tells the user why. `navigator.onLine` + the online/offline
 * events work in both the Android WebView and iOS WKWebView. No-ops on the
 * server and whenever the connection is fine.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
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
      No internet connection — some things won&apos;t work until you&apos;re back online.
    </div>
  );
}
