import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}

/**
 * One-shot geolocation that uses the native Capacitor plugin (reliable OS
 * permission prompt) inside the app shell, and the browser API on web.
 */
export async function getCurrentPositionCompat(
  options?: PositionOptions
): Promise<{ coords: { latitude: number; longitude: number } }> {
  if (isNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    return Geolocation.getCurrentPosition(options);
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}
