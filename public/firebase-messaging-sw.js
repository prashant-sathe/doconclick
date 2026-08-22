// Firebase Cloud Messaging service worker.
//
// This is a static file — it cannot read process.env, so the config below
// must be filled in by hand with the same values used for the
// NEXT_PUBLIC_FIREBASE_* vars in .env / .env.production. These are public
// client identifiers, not secrets (see Firebase Console > Project settings >
// General > Your apps > Web app).
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBuDhjFtjR_ulHz9VBax3BXNorvbbBcV0Q",
  authDomain: "doconclick.firebaseapp.com",
  projectId: "doconclick",
  storageBucket: "doconclick.firebasestorage.app",
  messagingSenderId: "642151905827",
  appId: "1:642151905827:web:ea8f5b6cb405d878450f96",
});

// The server always sends `notification` + `webpush.fcmOptions.link`, so FCM
// shows the OS notification on its own for background delivery — this call
// is still required for that to work at all (and for getToken() to succeed).
firebase.messaging();

// Background delivery (tab not focused) is auto-displayed by the Firebase SDK
// itself, which also registers its own notificationclick handler reading its
// own internal payload shape — don't touch those here, or a click would open
// two windows. This handler only reacts to notifications pushClient.ts's
// `registration.showNotification()` created for foreground delivery, tagged
// via `data.source` below so the two paths never overlap.
self.addEventListener("notificationclick", (event) => {
  if (event.notification.data?.source !== "doconclick-foreground") return;
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || "/"));
});
