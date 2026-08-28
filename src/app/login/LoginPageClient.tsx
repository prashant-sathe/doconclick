"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Phone, Lock, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { isNative } from "@/lib/platform";

const ROLE_HOME: Record<string, string> = {
  ADMIN:   "/admin",
  DOCTOR:  "/doctor/dashboard",
  PATIENT: "/patient/dashboard",
};

const ERROR_MESSAGES: Record<string, string> = {
  google_failed: "Something went wrong verifying your Google account. Please try again.",
  google_state_mismatch: "That verification link expired. Please try again.",
  google_no_account: "No DocOnClick account uses that Google email.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next");
  const { refresh } = useAuth();

  const [form, setForm] = useState({ mobile: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => ERROR_MESSAGES[searchParams.get("error") ?? ""] ?? "");

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.mobile || !form.password) { setError("Please enter your mobile number and password."); return; }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Login failed. Please try again.");
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
        <img src="/logo-icon.png" alt="DocOnClick" className="w-16 h-16 object-contain mx-auto mb-4" />
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Welcome back</h1>
        <p className="text-slate-500 mt-2 text-sm">Sign in to your DocOnClick account</p>
      </div>

      {/* Login Card */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        <form onSubmit={submit} className="space-y-5">
          {/* Mobile */}
          <div>
            <label className="input-label">
              <Phone className="inline w-3.5 h-3.5 mr-1.5" />
              Mobile Number
            </label>
            <input
              required
              type="tel"
              autoComplete="username"
              className="input-field"
              placeholder="Enter your mobile number"
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value)}
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between">
              <label className="input-label">
                <Lock className="inline w-3.5 h-3.5 mr-1.5" />
                Password
              </label>
              <Link href="/forgot-password" className="text-xs font-semibold text-blue-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="input-field pr-12"
                placeholder="Enter your password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
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
              <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px bg-slate-100 flex-1" />
          <span className="text-xs text-slate-400 font-medium">OR</span>
          <div className="h-px bg-slate-100 flex-1" />
        </div>
        <GoogleSignInButton next={nextUrl ?? undefined} />

        <div className="mt-6 pt-5 border-t border-slate-100 text-center space-y-2 text-sm text-slate-400">
          <p>
            New patient?{" "}
            <Link href="/patient/register" className="text-blue-600 font-semibold hover:underline">
              Create account →
            </Link>
          </p>
          <p>
            Are you a doctor?{" "}
            <Link href="/doctor/register" className="text-teal-600 font-semibold hover:underline">
              Join the network →
            </Link>
          </p>
        </div>
      </div>

      {/* Security note */}
      <p className="text-center text-xs text-slate-400 mt-5 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5" />
        Secured with 256-bit encryption. Your data is safe.
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
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNative()), []);

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center p-6">
      {!native && (
        <div className="fixed top-5 left-6">
          <Link href="/" className="btn-ghost gap-1.5 text-sm">← Home</Link>
        </div>
      )}
      <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
