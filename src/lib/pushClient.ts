import { deleteToken, getToken, onMessage } from "firebase/messaging";
import { getMessagingInstance } from "@/lib/firebaseClient";

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;
}

export async function subscribeToPush(): Promise<boolean> {
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
}
