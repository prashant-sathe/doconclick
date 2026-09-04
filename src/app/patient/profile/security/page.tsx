"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff } from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

export default function PatientSecurityPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: { password?: string; confirmPassword?: string }) => {
    setDirty(true);
    setSaved(false);
    setError("");
    if (patch.password !== undefined) setPassword(patch.password);
    if (patch.confirmPassword !== undefined) setConfirmPassword(patch.confirmPassword);
  };

  const save = async () => {
    setError("");
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setDirty(false);
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => router.push("/patient/profile"), 600);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not update your password.");
    }
  };

  return (
    <ProfileSubShell
      title="Change Password"
      description="Choose a new password for your account."
      icon={<Lock className="w-5 h-5" />}
      tint="bg-indigo-50 text-indigo-500"
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <div>
        <label className="input-label">New Password</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className="input-field pr-11"
            placeholder="Min. 6 characters"
            value={password}
            onChange={(e) => set({ password: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div>
        <label className="input-label">Confirm Password</label>
        <input
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          className="input-field"
          placeholder="Repeat password"
          value={confirmPassword}
          onChange={(e) => set({ confirmPassword: e.target.value })}
        />
      </div>
    </ProfileSubShell>
  );
}
