"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isPushSupported, fetchPushSubscriptionStatus, subscribeToPush, unsubscribeAllPush,
  isMac, openSystemNotificationSettings,
} from "@/lib/pushClient";

// Profile-page counterpart to EnableNotificationsPrompt: that popup shows once
// and can be dismissed forever, so this gives patients, doctors and admins a
// permanent place to turn push notifications on (or off) whenever they want.
//
// "Subscribed" is read from the server (does this account have any push
// token registered), not from browser permission or local storage — those
// only describe this device/browser and go stale the moment notifications
// were enabled from a different one, which would show the toggle as "off"
// for an account that's actually already receiving push.
export default function NotificationSettings() {
  const [supported, setSupported] = useState(true);
  const [checking, setChecking] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = isPushSupported();
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    fetchPushSubscriptionStatus()
      .then(setSubscribed)
      .finally(() => setChecking(false));
  }, []);

  const enable = async () => {
    setBusy(true);
    const ok = await subscribeToPush().catch(() => false);
    setBusy(false);
    setPermission(Notification.permission);
    setSubscribed(ok);
  };

  const disable = async () => {
    setBusy(true);
    await unsubscribeAllPush().catch(() => {});
    setBusy(false);
    setSubscribed(false);
  };

  if (!supported) {
    return (
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
          <Bell className="w-4 h-4 text-blue-500" /> Push Notifications
        </h2>
        <p className="text-sm text-slate-500">Not supported in this browser.</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Bell className="w-4 h-4 text-blue-500" /> Push Notifications
      </h2>

      {permission === "denied" ? (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
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
                type="button"
                onClick={openSystemNotificationSettings}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-amber-700 hover:bg-amber-100 mt-2 inline-flex items-center gap-1"
              >
                Open Mac notification settings <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
              subscribed ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
            )}>
              {subscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">
                {checking ? "Checking status…" : subscribed ? "Notifications are on" : "Notifications are off"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Get notified even when this tab isn&apos;t open — new requests, status updates and messages.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={subscribed ? disable : enable}
            disabled={busy || checking}
            className={cn(subscribed ? "btn-secondary" : "btn-primary", "flex-shrink-0 disabled:opacity-60")}
          >
            {busy || checking ? <Loader2 className="w-4 h-4 animate-spin" /> : subscribed ? "Turn off" : "Enable"}
          </button>
        </div>
      )}
    </section>
  );
}
