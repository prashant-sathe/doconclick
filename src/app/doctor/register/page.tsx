"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import {
  Stethoscope, User, Phone, Lock, Eye, EyeOff,
  Loader2, ArrowRight,
} from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { useAuth } from "@/components/AuthProvider";

export default function DoctorRegister() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [form, setForm] = useState({
    name: "", mobile: "", email: "", password: "", confirmPassword: "",
  });

  const set = (k: string, v: string) => { setError(""); setForm((f) => ({ ...f, [k]: v })); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.mobile) { setError("Please fill all required fields."); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    const res = await fetch("/api/doctors/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, mobile: form.mobile, email: form.email, password: form.password,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Registration failed.");
      return;
    }
    await refresh();
    router.push("/doctor/profile");
  };

  return (
    <div className="min-h-screen gradient-surface">
      <Navbar />
      <div className="pt-28 pb-16 px-6">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Stethoscope className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900">Doctor Registration</h1>
            <p className="text-slate-500 mt-2">Just the basics for now — you can complete your consultation profile after signing in.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="input-label"><User className="inline w-3.5 h-3.5 mr-1" />Full Name *</label>
                <input required className="input-field" placeholder="Dr. John Doe" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <label className="input-label"><Phone className="inline w-3.5 h-3.5 mr-1" />Mobile Number *</label>
                <input required className="input-field" placeholder="9800000000" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
              </div>
              <div>
                <label className="input-label">Email (optional)</label>
                <input type="email" className="input-field" placeholder="dr@email.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <label className="input-label"><Lock className="inline w-3.5 h-3.5 mr-1" />Password</label>
                <div className="relative">
                  <input required type={showPw ? "text" : "password"} autoComplete="new-password" className="input-field pr-10"
                    placeholder="Min. 6 characters" value={form.password} onChange={(e) => set("password", e.target.value)} />
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
            <GoogleSignInButton role="DOCTOR" label="Sign up with Google" />
          </div>

          <p className="text-center text-sm text-slate-400 mt-4">
            Already registered?{" "}
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">Sign In →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
