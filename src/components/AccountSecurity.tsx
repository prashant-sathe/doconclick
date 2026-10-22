"use client";
import { useState } from "react";
import Link from "next/link";
import { LogOut, Loader2, ShieldCheck, Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

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
        <button type="button" onClick={() => setConfirming(true)} className="tap-44-y btn-secondary py-2 px-3 text-xs mt-3">
          <LogOut className="w-3.5 h-3.5" /> Log out of all devices
        </button>
      )}
    </div>
  );
}

type DeletionPreview = {
  openBookings: number;
  refundTotal: number;
  walletBalanceAfter: number;
  blocker: string | null;
};

const CONFIRM_WORD = "DELETE";

// Permanently deletes the signed-in patient's, doctor's or nurse's account
// (DELETE /api/auth/account): shows what will happen to open bookings and
// money first, then needs the password plus a typed confirmation. Unstyled
// container, like LogoutAllDevices.
export function DeleteAccount() {
  const { user } = useAuth();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isPatient = user?.role === "PATIENT";
  const otherParty = isPatient ? "doctor or nurse" : "patient";

  const open = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/account", { cache: "no-store" });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Could not load your account details.");
      return;
    }
    setPreview(await res.json());
  };

  const close = () => {
    setPreview(null);
    setPassword("");
    setTyped("");
    setError("");
  };

  const run = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setBusy(false);
      setError((await res.json().catch(() => ({}))).error ?? "Could not delete your account.");
      return;
    }
    // A full navigation, so no in-memory auth state survives.
    window.location.href = "/data-deletion?deleted=1";
  };

  return (
    <div>
      <p className="font-bold text-red-600 text-sm">Delete my account</p>
      <p className="text-xs text-slate-500 mt-1">
        Permanently removes your account and personal details. This can&apos;t be undone.{" "}
        <Link href="/data-deletion" className="font-semibold text-blue-600 hover:underline">What gets deleted →</Link>
      </p>
      {!preview && error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {!preview ? (
        <button type="button" onClick={open} disabled={loading} className="tap-44-y btn-secondary py-2 px-3 text-xs mt-3 text-red-600">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Delete my account
        </button>
      ) : (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50/60 p-4 space-y-3">
          <div className="flex items-start gap-2 text-xs text-slate-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <ul className="space-y-1.5">
              <li>
                {preview.openBookings === 0
                  ? "You have no open bookings."
                  : `Your ${preview.openBookings} open booking${preview.openBookings === 1 ? "" : "s"} will be cancelled and the ${otherParty} notified.`}
                {preview.refundTotal > 0 &&
                  (isPatient
                    ? ` ₹${preview.refundTotal} already paid will be refunded to your wallet.`
                    : ` Patients will get ₹${preview.refundTotal} refunded to their wallets.`)}
              </li>
              {isPatient && preview.walletBalanceAfter > 0 && (
                <li>
                  Your wallet will hold ₹{preview.walletBalanceAfter}, which you can&apos;t use once the account is deleted.
                  Email{" "}
                  <a href="mailto:support@doconclick.com?subject=Wallet%20balance%20before%20account%20deletion" className="font-semibold text-blue-600 hover:underline">
                    support@doconclick.com
                  </a>{" "}
                  before deleting if you want it paid back.
                </li>
              )}
              {!isPatient && (
                <li>Earnings not yet settled are paid out as usual. Request a payout first if you&apos;re owed money.</li>
              )}
              <li>Completed visit records and payment history are kept, as the law requires.</li>
            </ul>
          </div>

          {preview.blocker ? (
            <p className="text-xs text-red-700 font-semibold">{preview.blocker}</p>
          ) : user?.hasPassword === false ? (
            <SetPasswordViaGoogle />
          ) : (
            <>
              <div>
                <label className="input-label">Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  className="input-field"
                  placeholder="Your current password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                />
              </div>
              <div>
                <label className="input-label">Type {CONFIRM_WORD} to confirm</label>
                <input
                  type="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="input-field"
                  placeholder={CONFIRM_WORD}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={busy} className="btn-secondary py-2 px-3 text-xs">
              Cancel
            </button>
            {!preview.blocker && user?.hasPassword !== false && (
              <button
                type="button"
                onClick={run}
                disabled={busy || !password || typed.trim().toUpperCase() !== CONFIRM_WORD}
                className="btn-danger py-2 px-3 text-xs"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Permanently delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
