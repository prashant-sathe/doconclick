"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { useTranslations } from "next-intl";

// ?error= codes from the Google flow → auth.googleError.* messages.
const ERRORS = {
  google_no_account: "google_no_account_reset",
  google_failed: "google_failed",
  google_state_mismatch: "google_state_mismatch",
} as const;
const isKnownError = (v: string): v is keyof typeof ERRORS => v in ERRORS;

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const t = useTranslations("auth.forgot");
  const tg = useTranslations("auth.googleError");

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-xl">
          <KeyRound className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{t("title")}</h1>
        <p className="text-slate-500 mt-2 text-sm">
          {t("subtitle")}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
            {isKnownError(error) ? tg(ERRORS[error]) : tg("generic")}
          </div>
        )}

        <p className="text-sm text-slate-500 mb-5">
          {t("explainer")}
        </p>

        <GoogleSignInButton intent="reset" label={t("verifyWithGoogle")} />
      </div>

      <p className="text-center text-sm text-slate-400 mt-5">
        {t("remembered")}{" "}
        <Link href="/login" className="text-blue-600 font-semibold hover:underline">{t("signIn")}</Link>
      </p>

      <p className="text-center text-xs text-slate-400 mt-5 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5" />
        {t("neverStore")}
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const native = useIsNativeApp();
  const tc = useTranslations("auth.common");

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
      <div className="fixed top-[calc(1.25rem_+_var(--safe-area-inset-top,env(safe-area-inset-top)))] left-6 z-10">
        <Link href={native ? "/login" : "/"} className="btn-ghost gap-1.5 text-sm">
          ← {native ? tc("back") : tc("home")}
        </Link>
      </div>
      <Suspense fallback={<div className="text-slate-400">{tc("loading")}</div>}>
        <ForgotPasswordContent />
      </Suspense>
    </div>
  );
}
