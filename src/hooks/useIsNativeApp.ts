"use client";
import { useEffect, useState } from "react";
import { isNative } from "@/lib/platform";

/**
 * `true` once mounted inside the Capacitor native app shell.
 *
 * Always `false` during SSR and the first client render — `Capacitor` isn't
 * available on the server, and reading it during render would mismatch the
 * SSR output and silently break hydration inside the WebView. The real value
 * is applied in a post-mount effect, after hydration has safely committed.
 */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot post-mount platform sync, not reactive state
  useEffect(() => setNative(isNative()), []);
  return native;
}
