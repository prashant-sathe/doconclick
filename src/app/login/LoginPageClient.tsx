"use client";
import LanguageSwitch from "@/components/LanguageSwitch";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Phone, Lock, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { isNative } from "@/lib/platform";
import { isValidMobile, normalizeMobile } from "@/lib/validation";
import { ROLE_HOME, safeNext } from "@/lib/roleHome";
import { useTranslations } from "next-intl";

// ?error= codes from the Google flow → auth.googleError.* messages.
const GOOGLE_ERRORS = ["google_failed", "google_state_mismatch", "google_no_account"] as const;
const isGoogleError = (v: string | null): v is (typeof GOOGLE_ERRORS)[number] =>
  !!v && (GOOGLE_ERRORS as readonly string[]).includes(v);

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = safeNext(searchParams.get("next"));
  const { refresh } = useAuth();
  const t = useTranslations("auth.login");
  const tc = useTranslations("auth.common");
  const tv = useTranslations("auth.validation");
  const tg = useTranslations("auth.googleError");

  const [form, setForm] = useState({ mobile: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => {
    const code = searchParams.get("error");
    return isGoogleError(code) ? tg(code) : "";
  });

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.mobile || !form.password) { setError(tv("mobileAndPasswordRequired")); return; }
    if (!isValidMobile(form.mobile)) { setError(tv("mobileInvalid")); return; }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: normalizeMobile(form.mobile), password: form.password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? t("failed"));
      setLoading(false);
      return;
    }

    await refresh();
    const destination = nextUrl ?? ROLE_HOME[data.role] ?? "/";
    router.push(destination);
    router.refresh();
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <Image src="/logo-icon.png" alt="DocOnClick" width={110} height={92} className="w-16 h-16 object-contain mx-auto mb-4" loading="eager" />
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{t("title")}</h1>
        <p className="text-slate-500 mt-2 text-sm">{t("subtitle")}</p>
      </div>

      {/* Login Card */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        <form onSubmit={submit} className="space-y-5">
          {/* Mobile */}
          <div>
            <label className="input-label">
              <Phone className="inline w-3.5 h-3.5 mr-1.5" />
              {tc("mobileNumber")}
            </label>
            <input
              required
              type="tel"
              inputMode="numeric"
              autoComplete="username"
              maxLength={10}
              className="input-field"
              placeholder={t("mobilePlaceholder")}
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between">
              <label className="input-label">
                <Lock className="inline w-3.5 h-3.5 mr-1.5" />
                {tc("password")}
              </label>
              <Link href="/forgot-password" className="text-xs font-semibold text-blue-600 hover:underline">
                {t("forgotPassword")}
              </Link>
            </div>
            <div className="relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="input-field pr-12"
                placeholder={t("passwordPlaceholder")}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
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

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center py-3.5 text-base mt-1"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t("signingIn")}</>
            ) : (
              t("signIn")
            )}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px bg-slate-100 flex-1" />
          <span className="text-xs text-slate-400 font-medium">{tc("or")}</span>
          <div className="h-px bg-slate-100 flex-1" />
        </div>
        <GoogleSignInButton next={nextUrl ?? undefined} />

        <div className="mt-6 pt-5 border-t border-slate-100 text-center space-y-2 text-sm text-slate-400">
          <p>
            {t("newPatient")}{" "}
            <Link href={nextUrl ? `/patient/register?next=${encodeURIComponent(nextUrl)}` : "/patient/register"} className="text-blue-600 font-semibold hover:underline">
              {t("createAccount")}
            </Link>
          </p>
          <p>
            {t("areYouDoctor")}{" "}
            <Link href="/doctor/register" className="text-teal-600 font-semibold hover:underline">
              {t("joinNetwork")}
            </Link>
          </p>
          <p>
            {t("areYouNurse")}{" "}
            <Link href="/nurse/register" className="text-rose-600 font-semibold hover:underline">
              {t("joinAsNurse")}
            </Link>
          </p>
        </div>
      </div>

      {/* Security note */}
      <p className="text-center text-xs text-slate-400 mt-5 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5" />
        {tc("secured")}
      </p>
    </div>
  );
}

export default function LoginPageClient() {
  // Capacitor.isNativePlatform() is already `true` by the time the client
  // hydrates, but the server always renders as web (no `window`) — calling
  // isNative() directly here would mismatch the SSR output and silently
  // break hydration for the whole page. Default to the server's answer and
  // correct it after mount, once hydration has safely committed.
  const tc = useTranslations("auth.common");
  const [native, setNative] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- isNative() is client-only; must run after mount to avoid hydration mismatch
  useEffect(() => setNative(isNative()), []);

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
      {!native && (
        <div className="fixed top-5 left-6">
          <Link href="/" className="btn-ghost gap-1.5 text-sm">← {tc("home")}</Link>
        </div>
      )}
      {/* Before signing in: the choice is kept and adopted by the account. */}
      <div className="fixed right-4 z-10" style={{ top: "calc(1rem + var(--safe-area-inset-top, env(safe-area-inset-top)))" }}>
        <LanguageSwitch compact />
      </div>
      <Suspense fallback={<div className="text-slate-400">{tc("loading")}</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
