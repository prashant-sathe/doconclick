import { registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

// Only registered/used on native — see src/app/doctor/dashboard/page.tsx's
// startJourney/markArrived for the web navigator.geolocation.watchPosition
// equivalent, which stops the moment the app is backgrounded.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

let watcherId: string | null = null;

/**
 * Starts a native background location watcher that keeps reporting while
 * the doctor's app is backgrounded/screen locked (Android requires — and
 * this plugin shows — a persistent foreground-service notification while
 * this is active). Only one watcher runs at a time.
 */
export async function startBackgroundLocationWatch(
  onLocation: (lat: number, lng: number) => void
): Promise<void> {
  if (watcherId) return;
  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: "Sharing your location",
      backgroundMessage: "DocOnClick is sharing your location with the patient for this home visit.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 20,
    },
    (location, error) => {
      if (error || !location) return;
      onLocation(location.latitude, location.longitude);
    }
  );
}

export async function stopBackgroundLocationWatch(): Promise<void> {
  if (!watcherId) return;
  const id = watcherId;
  watcherId = null;
  await BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
}
