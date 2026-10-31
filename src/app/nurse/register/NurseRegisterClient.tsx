"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthPageShell from "@/components/AuthPageShell";
import {
  HeartPulse, User, Phone, Lock, Eye, EyeOff,
  Loader2, ArrowRight,
} from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import ReferralCodeField, { useReferralCode } from "@/components/ReferralCodeField";
import { useAuth } from "@/components/AuthProvider";
import { isValidMobile, isValidEmail, normalizeMobile, nameErrorCode, PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { useTranslations } from "next-intl";

export default function NurseRegisterClient() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const t = useTranslations("auth.nurseRegister");
  const tr = useTranslations("auth.register");
  const tc = useTranslations("auth.common");
  const tv = useTranslations("auth.validation");
  const referral = useReferralCode("NURSE");

  const [form, setForm] = useState({
    name: "", mobile: "", email: "", password: "", confirmPassword: "",
  });

  const set = (k: string, v: string) => { setError(""); setForm((f) => ({ ...f, [k]: v })); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.mobile) { setError(tv("requiredFields")); return; }
    const nameErr = nameErrorCode(form.name);
    if (nameErr) { setError(tv(nameErr)); return; }
    if (!isValidMobile(form.mobile)) { setError(tv("mobileInvalidIndian")); return; }
    if (form.email && !isValidEmail(form.email)) { setError(tv("emailInvalid")); return; }
    if (form.password.length < PASSWORD_MIN_LENGTH) { setError(tv("passwordMin", { min: PASSWORD_MIN_LENGTH })); return; }
    if (form.password !== form.confirmPassword) { setError(tv("passwordMismatch")); return; }

    setLoading(true);
    // A code the server refused shows under the field; fix or clear it.
    if (!(await referral.confirm())) { setLoading(false); return; }
    const res = await fetch("/api/nurses/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(), mobile: normalizeMobile(form.mobile), email: form.email.trim(), password: form.password,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? tr("failed"));
      return;
    }
    await refresh();
    router.push("/nurse/profile");
  };

  return (
    <AuthPageShell backHref="/login">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-rose-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <HeartPulse className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 mt-2">{t("subtitle")}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="input-label"><User className="inline w-3.5 h-3.5 mr-1" />{tr("fullName")} *</label>
              <input required className="input-field" placeholder={t("namePlaceholder")} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <label className="input-label"><Phone className="inline w-3.5 h-3.5 mr-1" />{tc("mobileNumber")} *</label>
              <input required type="tel" inputMode="numeric" maxLength={10} className="input-field" placeholder="9800000000" value={form.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} />
            </div>
            <div>
              <label className="input-label">{tr("emailOptional")}</label>
              <input type="email" className="input-field" placeholder="you@email.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className="input-label"><Lock className="inline w-3.5 h-3.5 mr-1" />{tc("password")}</label>
              <div className="relative">
                <input required type={showPw ? "text" : "password"} autoComplete="new-password" className="input-field pr-10"
                  placeholder={tc("minChars", { min: PASSWORD_MIN_LENGTH })} value={form.password} onChange={(e) => set("password", e.target.value)} />
                <button type="button" aria-label={showPw ? tc("hidePassword") : tc("showPassword")} onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 tap-44">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="input-label">{tc("confirmPassword")}</label>
              <input required type="password" autoComplete="new-password" className="input-field"
                placeholder={tc("repeatPassword")} value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} />
            </div>

            <ReferralCodeField referral={referral} />

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3.5 text-base">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {tr("creatingAccount")}</> : <>{tr("createAccount")} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px bg-slate-100 flex-1" />
            <span className="text-xs text-slate-400 font-medium">{tc("or")}</span>
            <div className="h-px bg-slate-100 flex-1" />
          </div>
          <GoogleSignInButton role="NURSE" label={tr("signUpWithGoogle")} />
        </div>

        <p className="text-center text-sm text-slate-400 mt-4">
          {tr("alreadyRegistered")}{" "}
          <Link href="/login" className="text-blue-600 font-semibold hover:underline tap-44-y">{tr("signIn")}</Link>
        </p>
      </div>
    </AuthPageShell>
  );
}
