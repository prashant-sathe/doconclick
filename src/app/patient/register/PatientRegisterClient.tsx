"use client";
import { useState } from "react";
import Link from "next/link";
import AuthPageShell from "@/components/AuthPageShell";
import {
  Heart, User, Phone, Calendar, Lock, Eye, EyeOff,
  Loader2, CheckCircle, ArrowRight,
} from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function PatientRegisterClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const [form, setForm] = useState({
    name: "", mobile: "", email: "", dob: "", age: "", gender: "",
    password: "", confirmPassword: "",
  });

  const set = (k: string, v: string) => {
    setError("");
    if (k === "dob") {
      const age = v ? String(new Date().getFullYear() - new Date(v).getFullYear()) : "";
      setForm((f) => ({ ...f, dob: v, age }));
    } else {
      setForm((f) => ({ ...f, [k]: v }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.mobile || !form.gender || !form.dob) {
      setError("Please fill all required fields.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/patients/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, mobile: form.mobile, email: form.email,
        age: form.age, gender: form.gender, password: form.password,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Registration failed."); return; }
    setSuccess(true);
  };

  if (success) return (
    <div className="min-h-screen gradient-surface flex items-center justify-center safe-screen">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Welcome to DocOnClick!</h2>
        <p className="text-slate-500 mb-8">Your account is ready. Sign in to finish setting up your health profile and book your first consultation.</p>
        <Link href="/login" className="btn-primary w-full justify-center py-3.5 text-base">Sign In Now</Link>
        <p className="text-xs text-slate-400 mt-3">Or <Link href="/" className="text-blue-500 underline">return home</Link></p>
      </div>
    </div>
  );

  return (
    <AuthPageShell backHref="/login">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Heart className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Patient Registration</h1>
          <p className="text-slate-500 mt-2">Just the basics for now — you can complete your health profile after signing in.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="input-label"><User className="inline w-3.5 h-3.5 mr-1" />Full Name *</label>
                <input required className="input-field" placeholder="John Doe" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <label className="input-label"><Phone className="inline w-3.5 h-3.5 mr-1" />Mobile Number *</label>
                <input required className="input-field" placeholder="9800000000" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
              </div>
              <div>
                <label className="input-label">Email (optional)</label>
                <input type="email" className="input-field" placeholder="you@email.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <label className="input-label"><Calendar className="inline w-3.5 h-3.5 mr-1" />Date of Birth *</label>
                <input required type="date" className="input-field" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
              </div>
              <div>
                <label className="input-label">Gender *</label>
                <select required className="input-field" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                  <option value="">Select…</option>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="input-label">Age</label>
                <input readOnly className="input-field bg-slate-50 text-slate-500" placeholder="Auto-filled" value={form.age} />
              </div>
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
          <GoogleSignInButton role="PATIENT" label="Sign up with Google" />
        </div>

        <p className="text-center text-sm text-slate-400 mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 font-semibold hover:underline">Sign In →</Link>
        </p>
      </div>
    </AuthPageShell>
  );
}
