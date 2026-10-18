"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import NurseSubShell from "@/components/nurse/NurseSubShell";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { useAuth } from "@/components/AuthProvider";
import { SetPasswordViaGoogle, LogoutAllDevices } from "@/components/AccountSecurity";

// Same flow as the doctor's Change Password page (PATCH /api/auth/password).
export default function NurseSecurityPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!currentPassword) { setError("Enter your current password."); return; }
    if (password.length < PASSWORD_MIN_LENGTH) { setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setSaving(true);
    const res = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, password }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not update your password."); return; }
    setSaved(true);
    setCurrentPassword(""); setPassword(""); setConfirmPassword("");
    setTimeout(() => router.push("/nurse/profile"), 800);
  };

  return (
    <NurseSubShell title="Change Password" description="Choose a new password for your account." icon={<Lock className="w-5 h-5" />}>
      {user?.hasPassword === false ? (
        <SetPasswordViaGoogle />
      ) : (
      <form onSubmit={save} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div>
          <label className="input-label">Current Password</label>
          <input type={show ? "text" : "password"} autoComplete="current-password" className="input-field" placeholder="Your current password"
            value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setError(""); setSaved(false); }} />
        </div>
        <div>
          <label className="input-label">New Password</label>
          <div className="relative">
            <input type={show ? "text" : "password"} autoComplete="new-password" className="input-field pr-11" placeholder={`Min. ${PASSWORD_MIN_LENGTH} characters`}
              value={password} onChange={(e) => { setPassword(e.target.value); setError(""); setSaved(false); }} />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="input-label">Confirm Password</label>
          <input type={show ? "text" : "password"} autoComplete="new-password" className="input-field" placeholder="Repeat password"
            value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError(""); setSaved(false); }} />
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</div>}
        {saved && <p className="text-sm text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Password updated</p>}
        <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-3">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Update password"}
        </button>
      </form>
      )}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mt-4">
        <LogoutAllDevices />
      </div>
    </NurseSubShell>
  );
}
