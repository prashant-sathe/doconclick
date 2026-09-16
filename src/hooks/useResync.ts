"use client";
import { useEffect, useRef } from "react";

/**
 * Re-runs `onResync` whenever the screen is likely showing stale data: a
 * native resume from the background (see NativeBootstrap's "app:resume"
 * event), a browser/WebView tab regaining focus, or the device coming back
 * online after being offline. Debounced so several signals firing together
 * (e.g. resume + reconnect at once) only trigger one refetch.
 *
 * `onResync` doesn't need to be memoized — the latest version is always
 * called via a ref, so passing an inline function is fine.
 */
export function useResync(onResync: () => void) {
  const onResyncRef = useRef(onResync);
  useEffect(() => {
    onResyncRef.current = onResync;
  });

  useEffect(() => {
    let timer: number | null = null;
    const trigger = () => {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        onResyncRef.current();
      }, 150);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") trigger();
    };

    window.addEventListener("app:resume", trigger);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", trigger);

    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("app:resume", trigger);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", trigger);
    };
  }, []);
}
