"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff } from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { useAuth } from "@/components/AuthProvider";
import { SetPasswordViaGoogle, LogoutAllDevices, DeleteAccount } from "@/components/AccountSecurity";
import { useTranslations } from "next-intl";

export default function PatientSecurityPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations("patientAccount.security");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: { currentPassword?: string; password?: string; confirmPassword?: string }) => {
    setDirty(true);
    setSaved(false);
    setError("");
    if (patch.currentPassword !== undefined) setCurrentPassword(patch.currentPassword);
    if (patch.password !== undefined) setPassword(patch.password);
    if (patch.confirmPassword !== undefined) setConfirmPassword(patch.confirmPassword);
  };

  const save = async () => {
    setError("");
    if (!currentPassword) {
      setError(t("errCurrent"));
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("errLength", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("errMatch"));
      return;
    }

    setSaving(true);
    const res = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, password }),
    });
    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setDirty(false);
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => router.push("/patient/profile"), 600);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? t("errUpdate"));
    }
  };

  return (
    <ProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<Lock className="w-5 h-5" />}
      tint="bg-indigo-50 text-indigo-500"
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={user?.hasPassword === false ? undefined : save}
    >
      {user?.hasPassword === false ? (
        <SetPasswordViaGoogle />
      ) : (
        <>
          <div>
            <label className="input-label">{t("current")}</label>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="input-field"
              placeholder={t("currentPlaceholder")}
              value={currentPassword}
              onChange={(e) => set({ currentPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="input-label">{t("new")}</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="input-field pr-11"
                placeholder={t("newPlaceholder", { min: PASSWORD_MIN_LENGTH })}
                value={password}
                onChange={(e) => set({ password: e.target.value })}
              />
              <button aria-label={showPassword ? t("hide") : t("show")} aria-pressed={showPassword}
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="input-label">{t("confirm")}</label>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="input-field"
              placeholder={t("confirmPlaceholder")}
              value={confirmPassword}
              onChange={(e) => set({ confirmPassword: e.target.value })}
            />
          </div>
        </>
      )}
      <div className="pt-4 border-t border-slate-100">
        <LogoutAllDevices />
      </div>
      <div className="pt-4 border-t border-slate-100">
        <DeleteAccount />
      </div>
    </ProfileSubShell>
  );
}
