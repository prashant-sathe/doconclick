"use client";
import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  Heart, User, Phone, Calendar, MapPin, Lock, Eye, EyeOff,
  Loader2, CheckCircle, ArrowRight, ArrowLeft, Upload,
  Droplets, Ruler, Weight, AlertTriangle, Activity, Pill,
  Scissors, PhoneCall, UserCheck, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Step metadata ──────────────────────────────────────────────
const STEPS = [
  { n: 1, title: "Basic Details",    icon: User },
  { n: 2, title: "Address",          icon: MapPin },
  { n: 3, title: "Medical Info",     icon: Activity },
  { n: 4, title: "Set Password",     icon: Lock },
];

// ── Step indicator ─────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1 last:flex-none">
          <div className="step-item">
            <div className={cn("step-circle", current > s.n ? "done" : current === s.n ? "active" : "pending")}>
              {current > s.n ? <Check className="w-4 h-4" /> : s.n}
            </div>
            <span className={cn("text-[10px] font-semibold text-center leading-tight max-w-[60px]",
              current === s.n ? "text-blue-600" : current > s.n ? "text-slate-600" : "text-slate-400"
            )}>{s.title}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("step-line mb-5", current > s.n ? "done" : "pending")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Chip select ────────────────────────────────────────────────
function ChipSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  return (
    <div>
      <label className="input-label">{label}</label>
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map(o => (
          <button key={o} type="button" onClick={() => toggle(o)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
              value.includes(o) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            )}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PatientRegister() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Step 1 — Basic
  const [basic, setBasic] = useState({ name: "", mobile: "", email: "", dob: "", age: "", gender: "", photoUrl: "" });
  // Step 2 — Address
  const [address, setAddress] = useState({ location: "", homeAddress: "", landmark: "", pinCode: "" });
  // Step 3 — Medical
  const [medical, setMedical] = useState({
    bloodGroup: "", height: "", weight: "", allergies: "",
    chronicDiseases: [] as string[], medications: "", surgeries: "", emergencyContact: "",
  });
  // Step 4 — Password
  const [passwords, setPasswords] = useState({ password: "", confirmPassword: "" });

  const setB = (k: string, v: string) => {
    setError("");
    if (k === "dob") {
      const age = v ? String(new Date().getFullYear() - new Date(v).getFullYear()) : "";
      setBasic(f => ({ ...f, dob: v, age }));
    } else {
      setBasic(f => ({ ...f, [k]: v }));
    }
  };
  const setA  = (k: string, v: string) => { setError(""); setAddress(f => ({ ...f, [k]: v })); };
  const setM  = (k: string, v: string) => { setError(""); setMedical(f => ({ ...f, [k]: v })); };
  const setP  = (k: string, v: string) => { setError(""); setPasswords(f => ({ ...f, [k]: v })); };

  const getGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setA("location", `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
    );
  };

  const next = () => {
    setError("");
    if (step === 1) {
      if (!basic.name || !basic.mobile || !basic.gender || !basic.dob) { setError("Please fill all required fields."); return; }
    }
    if (step === 4) { submit(); return; }
    setStep(s => s + 1);
  };
  const back = () => setStep(s => s - 1);

  const submit = async () => {
    if (passwords.password !== passwords.confirmPassword) { setError("Passwords do not match."); return; }
    if (passwords.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const res = await fetch("/api/patients/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: basic.name, mobile: basic.mobile, email: basic.email,
        age: basic.age, gender: basic.gender, location: address.location,
        password: passwords.password,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Registration failed."); return; }
    setSuccess(true);
  };

  if (success) return (
    <div className="min-h-screen gradient-surface flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Welcome to DocOnClick!</h2>
        <p className="text-slate-500 mb-8">Your account is ready. Sign in to book your first consultation.</p>
        <Link href="/login" className="btn-primary w-full justify-center py-3.5 text-base">Sign In Now</Link>
        <p className="text-xs text-slate-400 mt-3">Or <Link href="/" className="text-blue-500 underline">return home</Link></p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen gradient-surface">
      <Navbar />
      <div className="pt-28 pb-16 px-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Heart className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900">Patient Registration</h1>
            <p className="text-slate-500 mt-2">Create your health profile in 4 simple steps.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <StepIndicator current={step} />

            {/* ── STEP 1: Basic Details ──────────────────────────── */}
            {step === 1 && (
              <div className="space-y-5 animate-fade-in-up">
                <h2 className="font-bold text-slate-900 text-lg mb-1">Basic Details</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label"><User className="inline w-3.5 h-3.5 mr-1" />Full Name *</label>
                    <input required className="input-field" placeholder="John Doe" value={basic.name} onChange={e => setB("name", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label"><Phone className="inline w-3.5 h-3.5 mr-1" />Mobile Number *</label>
                    <input required className="input-field" placeholder="9800000000" value={basic.mobile} onChange={e => setB("mobile", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Email (optional)</label>
                    <input type="email" className="input-field" placeholder="you@email.com" value={basic.email} onChange={e => setB("email", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label"><Calendar className="inline w-3.5 h-3.5 mr-1" />Date of Birth *</label>
                    <input required type="date" className="input-field" value={basic.dob} onChange={e => setB("dob", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Age (auto-calculated)</label>
                    <input readOnly className="input-field bg-slate-50 text-slate-500" placeholder="Auto-filled" value={basic.age} />
                  </div>
                  <div>
                    <label className="input-label">Gender *</label>
                    <select required className="input-field" value={basic.gender} onChange={e => setB("gender", e.target.value)}>
                      <option value="">Select…</option>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="input-label"><Upload className="inline w-3.5 h-3.5 mr-1" />Profile Photo URL (optional)</label>
                  <input type="url" className="input-field" placeholder="https://your-photo.com/image.jpg" value={basic.photoUrl} onChange={e => setB("photoUrl", e.target.value)} />
                </div>
              </div>
            )}

            {/* ── STEP 2: Address ────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-5 animate-fade-in-up">
                <h2 className="font-bold text-slate-900 text-lg mb-1">Your Address</h2>
                <div>
                  <label className="input-label"><MapPin className="inline w-3.5 h-3.5 mr-1" />Current Location</label>
                  <div className="flex gap-2">
                    <input className="input-field flex-1" placeholder="City, State or GPS coords" value={address.location} onChange={e => setA("location", e.target.value)} />
                    <button type="button" onClick={getGPS} className="btn-secondary flex-shrink-0 px-3 text-xs gap-1">
                      <MapPin className="w-3.5 h-3.5" /> GPS
                    </button>
                  </div>
                </div>
                <div>
                  <label className="input-label">Home Address</label>
                  <textarea rows={2} className="input-field resize-none" placeholder="Flat/House No., Street, Area" value={address.homeAddress} onChange={e => setA("homeAddress", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label">Landmark</label>
                    <input className="input-field" placeholder="e.g. Near Metro Station" value={address.landmark} onChange={e => setA("landmark", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">PIN Code</label>
                    <input className="input-field" placeholder="400001" maxLength={6} value={address.pinCode} onChange={e => setA("pinCode", e.target.value)} />
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
                  <strong>Saved Addresses:</strong> You can save Home, Office, and Parents addresses after registration from your profile dashboard.
                </div>
              </div>
            )}

            {/* ── STEP 3: Medical Info ───────────────────────────── */}
            {step === 3 && (
              <div className="space-y-5 animate-fade-in-up">
                <h2 className="font-bold text-slate-900 text-lg mb-1">Medical Information <span className="text-slate-400 text-sm font-normal">(all optional)</span></h2>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="input-label"><Droplets className="inline w-3.5 h-3.5 mr-1" />Blood Group</label>
                    <select className="input-field" value={medical.bloodGroup} onChange={e => setM("bloodGroup", e.target.value)}>
                      <option value="">Select…</option>
                      {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label"><Ruler className="inline w-3.5 h-3.5 mr-1" />Height (cm)</label>
                    <input type="number" className="input-field" placeholder="170" value={medical.height} onChange={e => setM("height", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label"><Weight className="inline w-3.5 h-3.5 mr-1" />Weight (kg)</label>
                    <input type="number" className="input-field" placeholder="70" value={medical.weight} onChange={e => setM("weight", e.target.value)} />
                  </div>
                </div>
                <ChipSelect
                  label="Chronic Diseases"
                  options={["Diabetes", "Hypertension", "Asthma", "Heart Disease", "Thyroid", "Arthritis", "COPD", "None"]}
                  value={medical.chronicDiseases}
                  onChange={v => { setError(""); setMedical(f => ({ ...f, chronicDiseases: v })); }}
                />
                <div>
                  <label className="input-label"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" />Known Allergies</label>
                  <input className="input-field" placeholder="e.g. Penicillin, Dust, Peanuts" value={medical.allergies} onChange={e => setM("allergies", e.target.value)} />
                </div>
                <div>
                  <label className="input-label"><Pill className="inline w-3.5 h-3.5 mr-1" />Current Medications</label>
                  <input className="input-field" placeholder="e.g. Metformin 500mg, Atorvastatin" value={medical.medications} onChange={e => setM("medications", e.target.value)} />
                </div>
                <div>
                  <label className="input-label"><Scissors className="inline w-3.5 h-3.5 mr-1" />Previous Surgeries</label>
                  <input className="input-field" placeholder="e.g. Appendectomy 2018" value={medical.surgeries} onChange={e => setM("surgeries", e.target.value)} />
                </div>
                <div>
                  <label className="input-label"><PhoneCall className="inline w-3.5 h-3.5 mr-1" />Emergency Contact</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input className="input-field" placeholder="Contact name" />
                    <input className="input-field" placeholder="Mobile number" value={medical.emergencyContact} onChange={e => setM("emergencyContact", e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 4: Password ───────────────────────────────── */}
            {step === 4 && (
              <div className="space-y-5 animate-fade-in-up">
                <h2 className="font-bold text-slate-900 text-lg mb-1">Secure Your Account</h2>
                <div>
                  <label className="input-label"><Lock className="inline w-3.5 h-3.5 mr-1" />Password</label>
                  <div className="relative">
                    <input required type={showPw ? "text" : "password"} autoComplete="new-password" className="input-field pr-10"
                      placeholder="Min. 6 characters" value={passwords.password} onChange={e => setP("password", e.target.value)} />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="input-label">Confirm Password</label>
                  <input required type="password" autoComplete="new-password" className="input-field"
                    placeholder="Repeat password" value={passwords.confirmPassword} onChange={e => setP("confirmPassword", e.target.value)} />
                </div>
                {/* Summary */}
                <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1.5 border border-slate-100">
                  <p className="font-semibold text-slate-700 mb-2 flex items-center gap-2"><UserCheck className="w-4 h-4 text-blue-500" /> Registration Summary</p>
                  {[
                    ["Name", basic.name],
                    ["Mobile", basic.mobile],
                    ["Age / Gender", `${basic.age} / ${basic.gender}`],
                    ["Location", address.location || "—"],
                    ["Blood Group", medical.bloodGroup || "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-400">{k}</span>
                      <span className="font-medium text-slate-700">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</div>}

            {/* Navigation */}
            <div className="flex gap-3 mt-8">
              {step > 1 && (
                <button onClick={back} className="btn-secondary flex-1 justify-center py-3">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              )}
              <button onClick={next} disabled={loading} className="btn-primary flex-[2] justify-center py-3">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account…</>
                  : step === 4 ? <><CheckCircle className="w-4 h-4" /> Create Account</>
                  : <>Next <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>

          <p className="text-center text-sm text-slate-400 mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">Sign In →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
