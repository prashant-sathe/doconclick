"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";

const ERROR_MESSAGES: Record<string, string> = {
  google_no_account: "No DocOnClick account uses that Google email. Sign in with your mobile number instead, or create an account.",
  google_failed: "Something went wrong verifying your Google account. Please try again.",
  google_state_mismatch: "That verification link expired. Please try again.",
};

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-xl">
          <KeyRound className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Forgot your password?</h1>
        <p className="text-slate-500 mt-2 text-sm">
          Verify it&apos;s you with Google, then set a new password.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
            {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
          </div>
        )}

        <p className="text-sm text-slate-500 mb-5">
          This only works if the Google account you sign in with uses the same email address as your DocOnClick account.
        </p>

        <GoogleSignInButton intent="reset" label="Verify with Google" />
      </div>

      <p className="text-center text-sm text-slate-400 mt-5">
        Remembered it?{" "}
        <Link href="/login" className="text-blue-600 font-semibold hover:underline">Sign in →</Link>
      </p>

      <p className="text-center text-xs text-slate-400 mt-5 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5" />
        We never see or store your Google password.
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center p-6">
      <div className="fixed top-5 left-6">
        <Link href="/" className="btn-ghost gap-1.5 text-sm">← Home</Link>
      </div>
      <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
        <ForgotPasswordContent />
      </Suspense>
    </div>
  );
}
