"use client";
import { useState } from "react";
import Link from "next/link";
import { LogOut, Loader2, ShieldCheck } from "lucide-react";

// Shown on the Change Password screens in place of the form for Google-only
// accounts: there's no current password to confirm, so setting one goes
// through the forgot-password flow's Google re-verification instead.
export function SetPasswordViaGoogle() {
  return (
    <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
      <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" />
      <p>
        You sign in with Google, so this account has no password yet.{" "}
        <Link href="/forgot-password" className="font-semibold text-blue-600 hover:underline">
          Verify with Google to set one →
        </Link>
      </p>
    </div>
  );
}

// Revokes every session for this account, this device included. Unstyled
// container — the caller places it in its own card or section.
export function LogoutAllDevices() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/logout-all", { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      setError((await res.json().catch(() => ({}))).error ?? "Could not sign out other devices.");
      return;
    }
    // A full navigation, so no in-memory auth state survives.
    window.location.href = "/login";
  };

  return (
    <div>
      <p className="font-bold text-slate-800 text-sm">Log out of all devices</p>
      <p className="text-xs text-slate-500 mt-1">
        Signs this account out everywhere — phones, tablets and browsers, including this one. Use it if you lost a device or think someone else is signed in.
      </p>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {confirming ? (
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="btn-secondary py-2 px-3 text-xs">
            Cancel
          </button>
          <button type="button" onClick={run} disabled={busy} className="btn-danger py-2 px-3 text-xs">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            Yes, log out everywhere
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-secondary py-2 px-3 text-xs mt-3">
          <LogOut className="w-3.5 h-3.5" /> Log out of all devices
        </button>
      )}
    </div>
  );
}
