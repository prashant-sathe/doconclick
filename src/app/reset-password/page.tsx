"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { ROLE_HOME } from "@/lib/roleHome";
import { useTranslations } from "next-intl";

export default function ResetPassword() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const t = useTranslations("auth.reset");
  const tc = useTranslations("auth.common");
  const tv = useTranslations("auth.validation");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(tv("passwordMin", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(tv("passwordMismatch"));
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // No current password is sent from here, so any of these means the
      // 15-minute Google verification has lapsed (or was never done).
      setError(
        ["REVERIFY_REQUIRED", "CURRENT_PASSWORD_REQUIRED", "WRONG_PASSWORD"].includes(data.code)
          ? t("verificationExpired")
          : data.error ?? t("failed")
      );
      return;
    }

    router.push(ROLE_HOME[user?.role ?? ""] ?? "/");
    router.refresh();
  };

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-xl">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{t("title")}</h1>
          <p className="text-slate-500 mt-2 text-sm">
            {user?.name ? t("subtitleNamed", { name: user.name }) : t("subtitle")}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="input-label">
                <Lock className="inline w-3.5 h-3.5 mr-1.5" />
                {t("newPassword")}
              </label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="input-field pr-12"
                  placeholder={tc("minChars", { min: PASSWORD_MIN_LENGTH })}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? tc("hidePassword") : tc("showPassword")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="input-label">{tc("confirmPassword")}</label>
              <input
                required
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="input-field"
                placeholder={tc("repeatPassword")}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3.5 text-base mt-1"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {tc("saving")}</> : t("save")}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          {tc("secured")}
        </p>
      </div>
    </div>
  );
}
