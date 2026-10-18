"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthPageShell from "@/components/AuthPageShell";
import { Heart, Phone, Lock, Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { useAuth } from "@/components/AuthProvider";
import { isValidMobile, normalizeMobile, PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { safeNext } from "@/lib/roleHome";

// `next` is where the visitor was headed before being sent to sign up (e.g. a
// doctor's booking page reached by scanning their QR) — land them back there.
export default function PatientRegisterClient({ next: rawNext }: { next?: string }) {
  const next = safeNext(rawNext);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const router = useRouter();
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [form, setForm] = useState({ mobile: "", password: "", confirmPassword: "" });

  const set = (k: keyof typeof form, v: string) => {
    setError("");
    setForm((f) => ({ ...f, [k]: v }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isValidMobile(form.mobile)) { setError("Enter a valid 10-digit Indian mobile number."); return; }
    if (form.password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/patients/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: normalizeMobile(form.mobile), password: form.password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setLoading(false); setError(data.error ?? "Registration failed."); return; }

    // The register route already signed us in — go straight to the app.
    await refresh();
    router.push(next ?? "/patient/dashboard");
    router.refresh();
  };

  return (
    <AuthPageShell backHref={loginHref}>
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Heart className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Create your account</h1>
          <p className="text-slate-500 mt-2">Takes a few seconds. We&apos;ll ask for a few details when you book your first consultation.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="input-label"><Phone className="inline w-3.5 h-3.5 mr-1" />Mobile Number</label>
              <input required type="tel" inputMode="numeric" autoComplete="tel" maxLength={10} className="input-field" placeholder="9800000000" value={form.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} />
            </div>

            <div>
              <label className="input-label"><Lock className="inline w-3.5 h-3.5 mr-1" />Password</label>
              <div className="relative">
                <input required type={showPw ? "text" : "password"} autoComplete="new-password" className="input-field pr-10"
                  placeholder={`Min. ${PASSWORD_MIN_LENGTH} characters`} value={form.password} onChange={(e) => set("password", e.target.value)} />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="input-label">Confirm Password</label>
              <input required type="password" autoComplete="new-password" className="input-field"
                placeholder="Repeat password" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} />
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3.5 text-base">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account…</> : <>Create Account <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px bg-slate-100 flex-1" />
            <span className="text-xs text-slate-400 font-medium">OR</span>
            <div className="h-px bg-slate-100 flex-1" />
          </div>
          <GoogleSignInButton role="PATIENT" next={next ?? undefined} label="Sign up with Google" />
        </div>

        <p className="text-center text-sm text-slate-400 mt-4">
          Already have an account?{" "}
          <Link href={loginHref} className="text-blue-600 font-semibold hover:underline">Sign In →</Link>
        </p>
      </div>
    </AuthPageShell>
  );
}
