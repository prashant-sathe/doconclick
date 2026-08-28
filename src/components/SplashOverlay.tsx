"use client";
import { useEffect, useState } from "react";
import { isNative } from "@/lib/platform";

// The native splash screen (LaunchScreen storyboard / Android splash theme) is
// compiled into the app binary and can't be changed without a store update, so
// it's kept as a plain background colour. This component is the *dynamic*
// layer: a full-screen overlay the WebView paints on first render, showing an
// admin-configured image, held for a fixed beat, then faded out. It also calls
// SplashScreen.hide() so the hand-off is: native colour → this overlay → app.
// Web is unaffected (returns null).
//
// The image + settings come from /api/app-config and are cached in
// localStorage, so every launch after the first shows the image instantly and
// offline. Trade-off: changing the image in the admin panel takes effect on
// the *next* launch (this launch still shows the previously cached image).

const CACHE_KEY = "doconclick_splash_config_v1";
const DISPLAY_MS = 6000; // how long the overlay stays up, from first paint
const FADE_MS = 350;

type SplashFit = "cover" | "contain";
type SplashConfig = { imageUrl: string | null; fit: SplashFit; bgColor: string };

const FALLBACK_BG = "#F8FAFC"; // matches the native splash colour

function normalize(raw: unknown): SplashConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.bgColor !== "string") return null;
  return {
    imageUrl: typeof r.imageUrl === "string" && r.imageUrl ? r.imageUrl : null,
    fit: r.fit === "contain" ? "contain" : "cover",
    bgColor: r.bgColor,
  };
}

function readCache(): SplashConfig | null {
  try {
    return normalize(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function SplashOverlay() {
  const [shown, setShown] = useState(false); // activated (native only)
  const [config, setConfig] = useState<SplashConfig | null>(null);
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timers: number[] = [];

    const start = () => {
      setConfig(readCache());
      setShown(true);

      // Take over from the native splash once this overlay has painted.
      requestAnimationFrame(() => {
        import("@capacitor/splash-screen")
          .then(({ SplashScreen }) => SplashScreen.hide())
          .catch(() => {});
      });

      // Fixed display time from first paint, then fade out.
      timers.push(
        window.setTimeout(() => {
          setFading(true);
          timers.push(window.setTimeout(() => setDone(true), FADE_MS));
        }, DISPLAY_MS),
      );

      // Refresh the config for next launch; adopt it now only if we had
      // nothing cached (first run), so the image isn't swapped mid-splash.
      fetch("/api/app-config")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const next = normalize(data?.splash);
          if (!next) return;
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(next));
          } catch {
            /* private mode / quota — next launch just refetches */
          }
          setConfig((prev) => prev ?? next);
        })
        .catch(() => {});
    };

    if (isNative()) start(); // web: `shown` stays false → renders null

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (done || !shown) return null;

  const bgColor = config?.bgColor ?? FALLBACK_BG;
  const image = config?.imageUrl;
  const fit = config?.fit ?? "cover";

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: bgColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          style={
            fit === "cover"
              ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }
              : { maxWidth: "72%", maxHeight: "44%", objectFit: "contain" }
          }
        />
      ) : (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "9999px",
            border: "3px solid rgba(100,116,139,0.25)",
            borderTopColor: "rgba(100,116,139,0.9)",
            animation: "doc-splash-spin 0.7s linear infinite",
          }}
        />
      )}
      <style>{"@keyframes doc-splash-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
