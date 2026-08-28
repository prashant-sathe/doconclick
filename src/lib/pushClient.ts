import { deleteToken, getToken, onMessage } from "firebase/messaging";
import { getMessagingInstance } from "@/lib/firebaseClient";
import { isNative, nativePlatform } from "@/lib/platform";

const SUBSCRIBED_KEY = "doconclick_push_subscribed";
const NATIVE_TOKEN_KEY = "doconclick_native_push_token";

export function isPushSupported(): boolean {
  if (isNative()) return true;
  return typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
}

// Native has its own OS-level permission model (checked via the Capacitor
// plugin), unrelated to the DOM Notification API's `Notification.permission`
// — that global exists inside the WebView but doesn't reflect real push
// permission state there, so callers must go through this instead of
// reading `Notification.permission` directly once native is in play.
export async function getPushPermissionState(): Promise<NotificationPermission> {
  if (isNative()) {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "default";
  }
  return Notification.permission;
}

// Browser-level Notification permission can be "granted" while the OS itself
// still silently drops the banner (e.g. macOS System Settings > Notifications
// has the browser turned off, or Focus/Do Not Disturb is on) — there's no JS
// API to detect that, so this link is offered unconditionally as a fallback,
// not gated on any check. Deep link only exists on macOS; other platforms get
// text-only guidance instead.
export function openSystemNotificationSettings() {
  window.location.href = "x-apple.systempreferences:com.apple.preference.notifications";
}

// Browser permission, once granted, can't be introspected or revoked via JS —
// so "subscribed" for our own UI purposes is tracked separately here. This
// flag is what lets a settings toggle show "off" after the user unsubscribes,
// even though `Notification.permission` itself stays "granted" forever.
export function isPushSubscribedLocally(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(SUBSCRIBED_KEY) === "1";
}

// Ground truth for "is this account currently getting push notifications" —
// checks the server instead of the (possibly stale) local flag above, so a
// settings toggle reflects reality even if permission was granted from a
// different device/session or before this flag existed.
export async function fetchPushSubscriptionStatus(): Promise<boolean> {
  const res = await fetch("/api/push/subscribe").catch(() => null);
  if (!res || !res.ok) return false;
  const data = await res.json().catch(() => null);
  return !!data?.subscribed;
}

async function subscribeToPushNative(): Promise<boolean> {
  const { PushNotifications } = await import("@capacitor/push-notifications");

  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") return false;

  const token = await new Promise<string | null>((resolve) => {
    PushNotifications.addListener("registration", (t) => resolve(t.value));
    PushNotifications.addListener("registrationError", () => resolve(null));
    PushNotifications.register();
  });
  if (!token) return false;

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, userAgent: `capacitor-${nativePlatform()}` }),
  });
  localStorage.setItem(NATIVE_TOKEN_KEY, token);
  localStorage.setItem(SUBSCRIBED_KEY, "1");
  return true;
}

export async function subscribeToPush(): Promise<boolean> {
  if (isNative()) return subscribeToPushNative();
  if (!isPushSupported()) return false;

  const messaging = await getMessagingInstance();
  if (!messaging) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });
  if (!token) return false;

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, userAgent: navigator.userAgent }),
  });
  localStorage.setItem(SUBSCRIBED_KEY, "1");
  return true;
}

// FCM only auto-shows an OS notification via the service worker when the tab
// isn't focused — while the tab is open and focused, a "notification" payload
// is instead delivered here in-page and the browser shows nothing on its own.
// Wired once at app start (see AuthProvider) so testing/using the app in an
// active tab still surfaces a real Notification, not just silence.
//
// Must go through the ServiceWorkerRegistration, not `new Notification(...)`
// — once a page has an active service worker registration, Chrome/Firefox
// throw "Illegal constructor" on the direct Notification constructor and
// require `registration.showNotification()` instead. Click handling for
// these lives in the service worker's `notificationclick` listener, not here.
export async function listenForForegroundPush(): Promise<void> {
  // Native foreground delivery is handled by the OS + the
  // pushNotificationActionPerformed listener in NativeBootstrap — this
  // function is web-only (service worker based).
  if (isNative()) return;
  if (!isPushSupported() || Notification.permission !== "granted") return;
  const messaging = await getMessagingInstance();
  if (!messaging) return;

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return;

  onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? "DocOnClick";
    const body = payload.notification?.body;
    const url = payload.fcmOptions?.link ?? "/";
    registration.showNotification(title, { body, data: { url, source: "doconclick-foreground" } });
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (isNative()) {
    const token = localStorage.getItem(NATIVE_TOKEN_KEY);
    if (token) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
    localStorage.removeItem(NATIVE_TOKEN_KEY);
    localStorage.removeItem(SUBSCRIBED_KEY);
    return;
  }

  const messaging = await getMessagingInstance();
  if (!messaging) return;

  const token = await getToken(messaging).catch(() => null);
  await deleteToken(messaging).catch(() => {});
  if (token) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});
  }
  localStorage.removeItem(SUBSCRIBED_KEY);
}

// Account-wide opt-out for the settings toggle: clears this device's FCM
// token and tells the server to drop every token on the account, so "off"
// here actually means off everywhere, not just on the current browser.
export async function unsubscribeAllPush(): Promise<void> {
  if (!isNative()) {
    const messaging = await getMessagingInstance();
    if (messaging) {
      await deleteToken(messaging).catch(() => {});
    }
  }
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).catch(() => {});
  localStorage.removeItem(NATIVE_TOKEN_KEY);
  localStorage.removeItem(SUBSCRIBED_KEY);
}
