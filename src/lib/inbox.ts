// The in-app notification inbox (Notification rows, written for every push in
// src/lib/firebaseAdmin.ts). Anything that changes the unread count — a push
// arriving while the app is open, marking items read — fires this event so
// every mounted badge (useInboxUnread) refetches at once instead of waiting
// for its next poll.
export const INBOX_CHANGED_EVENT = "doconclick:inbox-changed";

export function notifyInboxChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
}

/** Each role's inbox page; STAFF shares the doctor area. */
export const INBOX_HREF: Record<string, string> = {
  PATIENT: "/patient/inbox",
  DOCTOR: "/doctor/inbox",
  STAFF: "/doctor/inbox",
  NURSE: "/nurse/inbox",
  ADMIN: "/admin/inbox",
};
