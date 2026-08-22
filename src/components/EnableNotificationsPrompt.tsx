"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, ExternalLink, X } from "lucide-react";
import { isPushSupported, subscribeToPush } from "@/lib/pushClient";

const DISMISSED_KEY = "doconclick_push_prompt_dismissed";
const GRANTED_HINT_DISMISSED_KEY = "doconclick_push_granted_hint_dismissed";

function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
}

// Browser-level Notification permission can be "granted" while the OS itself
// still silently drops the banner (e.g. macOS System Settings > Notifications
// has the browser turned off, or Focus/Do Not Disturb is on) — there's no JS
// API to detect that, so this link is offered unconditionally as a fallback,
// not gated on any check. Deep link only exists on macOS; other platforms get
// text-only guidance instead.
function openSystemNotificationSettings() {
  window.location.href = "x-apple.systempreferences:com.apple.preference.notifications";
}

export default function EnableNotificationsPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [visible, setVisible] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    const current = Notification.permission;
    setPermission(current);
    if (current === "default" && !localStorage.getItem(DISMISSED_KEY)) {
      setVisible(true);
    }
    if (current === "granted" && !localStorage.getItem(GRANTED_HINT_DISMISSED_KEY)) {
      setHintVisible(true);
    }
  }, []);

  if (permission === null) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  const dismissHint = () => {
    localStorage.setItem(GRANTED_HINT_DISMISSED_KEY, "1");
    setHintVisible(false);
  };

  const enable = async () => {
    setBusy(true);
    const ok = await subscribeToPush().catch(() => false);
    setBusy(false);
    setPermission(Notification.permission);
    dismiss();
    if (ok) setHintVisible(true);
  };

  if (permission === "denied") {
    return (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-4">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <BellOff className="w-4 h-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Notifications are blocked</p>
          <p className="text-xs text-slate-500 mt-0.5">
            You&apos;ve blocked notifications for this site in your browser. Allow them from your browser&apos;s
            site settings, then reload this page.
            {isMac() && " If they still don't show up, your Mac's system notification settings may also be blocking them."}
          </p>
          {isMac() && (
            <button
              onClick={openSystemNotificationSettings}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-amber-700 hover:bg-amber-100 mt-2 inline-flex items-center gap-1"
            >
              Open Mac notification settings <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (visible) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full relative">
          <button onClick={dismiss} className="absolute top-4 right-4 text-slate-300 hover:text-slate-500">
            <X className="w-4 h-4" />
          </button>
          <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
            <Bell className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-extrabold text-slate-900">Turn on notifications</h3>
          <p className="text-sm text-slate-500 mt-1.5">
            Get notified even when this tab isn&apos;t open — new requests, status updates, and messages.
          </p>
          <div className="flex gap-3 mt-5">
            <button onClick={dismiss} disabled={busy} className="btn-secondary flex-1 disabled:opacity-60">
              Not now
            </button>
            <button onClick={enable} disabled={busy} className="btn-primary flex-1 disabled:opacity-60">
              {busy ? "Enabling..." : "Enable"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hintVisible) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
        <Bell className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        <span>Notifications are on.</span>
        {isMac() && (
          <button onClick={openSystemNotificationSettings} className="underline hover:text-slate-600">
            Not receiving them? Open Mac settings
          </button>
        )}
        <button onClick={dismissHint} className="ml-auto text-slate-300 hover:text-slate-500">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return null;
}
