"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { isValidMobile, normalizeMobile } from "@/lib/validation";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  DOCTOR: "/doctor/dashboard",
  PATIENT: "/patient/dashboard",
};

export default function CompleteProfile() {
  const router = useRouter();
  const { user, loading: authLoading, refresh } = useAuth();
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidMobile(mobile)) { setError("Enter a valid 10-digit mobile number."); return; }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/mobile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: normalizeMobile(mobile) }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Could not save your mobile number.");
      setLoading(false);
      return;
    }

    await refresh();
    router.push(ROLE_HOME[data.role] ?? "/");
    router.refresh();
  };

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-xl">
            <Phone className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">One last step</h1>
          <p className="text-slate-500 mt-2 text-sm">
            {user?.name ? `Welcome, ${user.name}! ` : ""}
            Add your mobile number to continue.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="input-label">
                <Phone className="inline w-3.5 h-3.5 mr-1.5" />
                Mobile Number
              </label>
              <input
                required
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                className="input-field"
                placeholder="Enter your 10-digit mobile number"
                value={mobile}
                onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }}
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
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Continue"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          We use this to keep your account secure and let doctors reach you.
        </p>
      </div>
    </div>
  );
}
