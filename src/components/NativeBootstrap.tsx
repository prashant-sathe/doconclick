"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNative, nativePlatform } from "@/lib/platform";

// Matches .gradient-surface / the splash background. Nearly every screen
// renders a light header, so the status bar wants dark icons on a light
// ground (Style.Light in Capacitor's naming).
const STATUS_BAR_BG = "#F8FAFC";
const SPLASH_SAFETY_TIMEOUT_MS = 4000;
const APP_ORIGIN = "https://doconclick.co.in";

/**
 * Wires up native shell chrome (status bar, splash screen, Android back
 * button, push-notification taps). No-ops entirely on web.
 *
 * Each concern is isolated in its own try/catch: a plugin that's missing or
 * throws on one platform must not take down the others — in particular the
 * push-notification tap listener, which is what routes a user to the right
 * screen when they tap an alert.
 */
export function NativeBootstrap() {
  const router = useRouter();

  useEffect(() => {
    if (!isNative()) return;
    document.documentElement.classList.add("native-app");

    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const platform = nativePlatform();

    (async () => {
      // --- Splash screen: hide as early as possible, with a safety net ---
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        if (cancelled) return;
        SplashScreen.hide().catch(() => {});
        const splashTimer = setTimeout(
          () => SplashScreen.hide().catch(() => {}),
          SPLASH_SAFETY_TIMEOUT_MS,
        );
        cleanups.push(() => clearTimeout(splashTimer));
      } catch {
        /* splash auto-hides natively by default; ignore */
      }

      // --- Status bar styling ---
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        if (cancelled) return;
        // Style.Light = dark icons/text (for a light background). No-op on
        // pre-15 Android without a bg colour, so set a light one too.
        StatusBar.setBackgroundColor({ color: STATUS_BAR_BG }).catch(() => {});
        StatusBar.setStyle({ style: Style.Light }).catch(() => {});
      } catch {
        /* ignore */
      }

      // --- Android back button + deep-link (App Links / Universal Links) routing ---
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;

        const backListener = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            router.back();
          } else {
            App.exitApp();
          }
        });
        cleanups.push(() => backListener.remove());

        // A https://doconclick.co.in/... link tapped elsewhere (email, SMS,
        // another app) opens the app here — navigate to that in-app path
        // instead of leaving the user on whatever screen was showing.
        const routeFromUrl = (url: string | undefined) => {
          if (!url) return;
          try {
            const u = new URL(url);
            if (u.origin === APP_ORIGIN && u.pathname && u.pathname !== "/") {
              router.push(u.pathname + u.search);
            }
          } catch {
            /* not a URL we can route */
          }
        };
        App.getLaunchUrl().then((res) => routeFromUrl(res?.url)).catch(() => {});
        const urlOpenListener = await App.addListener("appUrlOpen", ({ url }) => routeFromUrl(url));
        cleanups.push(() => urlOpenListener.remove());
      } catch {
        /* ignore */
      }

      // --- Push notifications: alert channel + tap routing ---
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        if (cancelled) return;

        if (platform === "android") {
          // Distinct from the Phase 4 foreground-service "sharing your
          // location" channel, so alerts and the location-tracking
          // persistent notification don't share settings/sound.
          PushNotifications.createChannel({
            id: "doconclick-alerts",
            name: "Appointment alerts",
            description: "Appointment updates, doctor arrival, and other DocOnClick alerts",
            importance: 4,
            visibility: 1,
          }).catch(() => {});
        }

        const tapListener = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const url = action.notification.data?.url;
            if (typeof url === "string" && url) router.push(url);
          },
        );
        cleanups.push(() => tapListener.remove());
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
