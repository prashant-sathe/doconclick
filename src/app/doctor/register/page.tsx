"use client";
import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  Stethoscope, User, Award, DollarSign, Clock, MapPin, CreditCard,
  Lock, Eye, EyeOff, Loader2, CheckCircle, ArrowRight, ArrowLeft,
  Phone, Hash, Star, Briefcase, Globe, Shield, Check, Camera,
  Building, FileText, Video, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, title: "Personal",      icon: User },
  { n: 2, title: "Professional",  icon: Award },
  { n: 3, title: "Verification",  icon: Shield },
  { n: 4, title: "Availability",  icon: Clock },
  { n: 5, title: "Password",      icon: Lock },
];

const SPECIALTIES = [
  "Cardiologist","Dermatologist","General Physician","Neurologist",
  "Orthopedic","Pediatrician","Psychiatrist","Gynecologist",
  "ENT Specialist","Ophthalmologist","Diabetologist","Oncologist",
  "Radiologist","Gastroenterologist","Urologist",
];

const LANGUAGES = ["English","Hindi","Marathi","Tamil","Telugu","Kannada","Bengali","Gujarati","Malayalam"];
const COUNCILS   = ["Medical Council of India (MCI)","Maharashtra Medical Council","Delhi Medical Council","Tamil Nadu Medical Council","Karnataka Medical Council","Other"];

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

function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white">
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
      <button type="button" onClick={() => onChange(!value)}
        className={cn("relative w-11 h-6 rounded-full transition-colors flex-shrink-0", value ? "bg-blue-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", value ? "left-5.5" : "left-0.5")} style={{ left: value ? "calc(100% - 22px)" : "2px" }} />
      </button>
    </div>
  );
}

export default function DoctorRegister() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Step 1 — Personal
  const [personal, setPersonal] = useState({ name: "", mobile: "", email: "", gender: "", photoUrl: "", languages: [] as string[] });
  // Step 2 — Professional
  const [professional, setProfessional] = useState({
    qualification: "", specialty: "", superSpecialty: "", medRegNo: "",
    medCouncil: "", experience: "", hospital: "", clinicAddress: "", consultFee: "", homeVisitFee: "",
  });
  // Step 3 — Verification
  const [verification, setVerification] = useState({ degreeCert: "", regCert: "", aadhaar: "", gst: "", bankAccount: "", ifsc: "", bankName: "" });
  // Step 4 — Availability
  const [avail, setAvail] = useState({
    days: [] as string[], fromTime: "09:00", toTime: "18:00",
    radius: "10", homeVisits: true, teleconsult: true,
    aboutMe: "", specialInterests: "", awards: "",
  });
  // Step 5 — Password
  const [passwords, setPasswords] = useState({ password: "", confirmPassword: "" });

  const clearError = () => setError("");
  const setP  = (k: string, v: string) => { clearError(); setPersonal(f => ({ ...f, [k]: v })); };
  const setPr = (k: string, v: string) => { clearError(); setProfessional(f => ({ ...f, [k]: v })); };
  const setV  = (k: string, v: string) => { clearError(); setVerification(f => ({ ...f, [k]: v })); };
  const setAv = (k: string, v: string | boolean) => { clearError(); setAvail(f => ({ ...f, [k]: v })); };
  const setPw = (k: string, v: string) => { clearError(); setPasswords(f => ({ ...f, [k]: v })); };

  const toggleLang = (lang: string) =>
    setPersonal(f => ({ ...f, languages: f.languages.includes(lang) ? f.languages.filter(l => l !== lang) : [...f.languages, lang] }));
  const toggleDay = (day: string) =>
    setAvail(f => ({ ...f, days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day] }));

  const next = () => {
    clearError();
    if (step === 1 && (!personal.name || !personal.mobile || !personal.gender)) { setError("Please fill all required fields."); return; }
    if (step === 2 && (!professional.qualification || !professional.specialty || !professional.medRegNo)) { setError("Please fill all required fields."); return; }
    if (step === 5) { submit(); return; }
    setStep(s => s + 1);
  };
  const back = () => setStep(s => s - 1);

  const submit = async () => {
    if (passwords.password !== passwords.confirmPassword) { setError("Passwords do not match."); return; }
    if (passwords.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const res = await fetch("/api/doctors/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: personal.name, mobile: personal.mobile, email: personal.email,
        qualification: professional.qualification, medRegNo: professional.medRegNo,
        specialty: professional.specialty, experience: professional.experience,
        consultFee: professional.consultFee, homeVisitFee: professional.homeVisitFee,
        availability: avail.days.length ? `${avail.days.join(", ")} ${avail.fromTime}–${avail.toTime}` : "Mon-Fri, 9AM-6PM",
        radius: avail.radius,
        bankDetails: `${verification.bankName} | ${verification.bankAccount} | IFSC: ${verification.ifsc}`,
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
        <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-amber-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Registration Submitted!</h2>
        <p className="text-slate-500 mb-2">Your profile is under review by our admin team.</p>
        <p className="text-sm text-slate-400 mb-8">You'll be approved within 24–48 hours. You can then sign in.</p>
        <Link href="/login" className="btn-primary w-full justify-center py-3.5">Sign In</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen gradient-surface">
      <Navbar />
      <div className="pt-28 pb-16 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Stethoscope className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900">Doctor Registration</h1>
            <p className="text-slate-500 mt-2">Join 1,200+ verified doctors on DocOnClick.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <StepIndicator current={step} />

            {/* ── STEP 1: Personal ──────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-5 animate-fade-in-up">
                <h2 className="font-bold text-slate-900 text-lg">Personal Details</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label"><User className="inline w-3.5 h-3.5 mr-1" />Full Name *</label>
                    <input required className="input-field" placeholder="Dr. John Doe" value={personal.name} onChange={e => setP("name", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label"><Phone className="inline w-3.5 h-3.5 mr-1" />Mobile *</label>
                    <input required className="input-field" placeholder="9800000000" value={personal.mobile} onChange={e => setP("mobile", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Email</label>
                    <input type="email" className="input-field" placeholder="dr@email.com" value={personal.email} onChange={e => setP("email", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Gender *</label>
                    <select required className="input-field" value={personal.gender} onChange={e => setP("gender", e.target.value)}>
                      <option value="">Select…</option>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="input-label"><Camera className="inline w-3.5 h-3.5 mr-1" />Profile Photo URL</label>
                  <input type="url" className="input-field" placeholder="https://your-photo-link.com" value={personal.photoUrl} onChange={e => setP("photoUrl", e.target.value)} />
                </div>
                <div>
                  <label className="input-label"><Globe className="inline w-3.5 h-3.5 mr-1" />Languages Spoken</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {LANGUAGES.map(lang => (
                      <button key={lang} type="button" onClick={() => toggleLang(lang)}
                        className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                          personal.languages.includes(lang) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        )}>
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: Professional ──────────────────────────── */}
            {step === 2 && (
              <div className="space-y-5 animate-fade-in-up">
                <h2 className="font-bold text-slate-900 text-lg">Professional Details</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label">Qualification *</label>
                    <input required className="input-field" placeholder="MBBS, MD" value={professional.qualification} onChange={e => setPr("qualification", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label"><Star className="inline w-3.5 h-3.5 mr-1" />Specialty *</label>
                    <select required className="input-field" value={professional.specialty} onChange={e => setPr("specialty", e.target.value)}>
                      <option value="">Select…</option>
                      {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Super-specialty (if any)</label>
                    <input className="input-field" placeholder="e.g. Interventional Cardiology" value={professional.superSpecialty} onChange={e => setPr("superSpecialty", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label"><Hash className="inline w-3.5 h-3.5 mr-1" />Medical Reg. No. *</label>
                    <input required className="input-field" placeholder="MCI-12345" value={professional.medRegNo} onChange={e => setPr("medRegNo", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Medical Council</label>
                    <select className="input-field" value={professional.medCouncil} onChange={e => setPr("medCouncil", e.target.value)}>
                      <option value="">Select…</option>
                      {COUNCILS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label"><Briefcase className="inline w-3.5 h-3.5 mr-1" />Years of Experience</label>
                    <input type="number" min={0} className="input-field" placeholder="5" value={professional.experience} onChange={e => setPr("experience", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label"><Building className="inline w-3.5 h-3.5 mr-1" />Current Hospital / Clinic</label>
                    <input className="input-field" placeholder="Apollo Hospitals" value={professional.hospital} onChange={e => setPr("hospital", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Clinic Address</label>
                    <input className="input-field" placeholder="Full clinic address" value={professional.clinicAddress} onChange={e => setPr("clinicAddress", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Clinic/Video Fee (₹)</label>
                    <input required type="number" min={0} className="input-field" placeholder="500" value={professional.consultFee} onChange={e => setPr("consultFee", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Home Visit Fee (₹)</label>
                    <input required type="number" min={0} className="input-field" placeholder="800" value={professional.homeVisitFee} onChange={e => setPr("homeVisitFee", e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Verification ──────────────────────────── */}
            {step === 3 && (
              <div className="space-y-5 animate-fade-in-up">
                <h2 className="font-bold text-slate-900 text-lg">Verification Documents</h2>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                  <strong>Verification Notice:</strong> All documents are reviewed by our admin team. Your profile goes live only after verification (24–48 hrs).
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { k: "degreeCert", label: "Medical Degree Certificate URL", icon: FileText },
                    { k: "regCert",    label: "Registration Certificate URL",  icon: Shield },
                    { k: "aadhaar",    label: "Aadhaar / PAN Number",          icon: User },
                    { k: "gst",        label: "GST Number (optional)",         icon: Hash },
                  ].map(({ k, label, icon: Icon }) => (
                    <div key={k}>
                      <label className="input-label"><Icon className="inline w-3.5 h-3.5 mr-1" />{label}</label>
                      <input className="input-field" placeholder={label} value={(verification as Record<string, string>)[k]} onChange={e => setV(k, e.target.value)} />
                    </div>
                  ))}
                </div>
                <div>
                  <p className="form-section-title"><CreditCard className="w-4 h-4" />Bank Account Details</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="input-label">Bank Name</label>
                      <input className="input-field" placeholder="HDFC Bank" value={verification.bankName} onChange={e => setV("bankName", e.target.value)} />
                    </div>
                    <div>
                      <label className="input-label">Account Number</label>
                      <input className="input-field" placeholder="XXXX XXXX XXXX" value={verification.bankAccount} onChange={e => setV("bankAccount", e.target.value)} />
                    </div>
                    <div>
                      <label className="input-label">IFSC Code</label>
                      <input className="input-field" placeholder="HDFC0001234" value={verification.ifsc} onChange={e => setV("ifsc", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 4: Availability ──────────────────────────── */}
            {step === 4 && (
              <div className="space-y-5 animate-fade-in-up">
                <h2 className="font-bold text-slate-900 text-lg">Availability & Profile</h2>
                <div>
                  <label className="input-label">Available Days</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => (
                      <button key={day} type="button" onClick={() => toggleDay(day)}
                        className={cn("px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                          avail.days.includes(day) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        )}>
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label">From Time</label>
                    <input type="time" className="input-field" value={avail.fromTime} onChange={e => setAv("fromTime", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">To Time</label>
                    <input type="time" className="input-field" value={avail.toTime} onChange={e => setAv("toTime", e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="input-label"><MapPin className="inline w-3.5 h-3.5 mr-1" />Consultation Radius (km)</label>
                  <select className="input-field" value={avail.radius} onChange={e => setAv("radius", e.target.value)}>
                    <option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option><option value="50">50 km</option>
                  </select>
                </div>
                <Toggle label="Instant Home Visits" sub="Accept home visit requests" value={avail.homeVisits} onChange={v => setAv("homeVisits", v)} />
                <Toggle label="Teleconsultation" sub="Accept video call consultations" value={avail.teleconsult} onChange={v => setAv("teleconsult", v)} />
                <div className="form-section">
                  <p className="form-section-title">Your Profile</p>
                  <div className="space-y-4">
                    <div>
                      <label className="input-label">About Me</label>
                      <textarea rows={3} className="input-field resize-none" placeholder="Brief introduction about your practice, approach and expertise…" value={avail.aboutMe} onChange={e => setAv("aboutMe", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="input-label">Special Interests</label>
                        <input className="input-field" placeholder="e.g. Preventive cardiology" value={avail.specialInterests} onChange={e => setAv("specialInterests", e.target.value)} />
                      </div>
                      <div>
                        <label className="input-label">Awards & Certifications</label>
                        <input className="input-field" placeholder="e.g. FACC 2020" value={avail.awards} onChange={e => setAv("awards", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 5: Password ──────────────────────────────── */}
            {step === 5 && (
              <div className="space-y-5 animate-fade-in-up">
                <h2 className="font-bold text-slate-900 text-lg">Secure Your Account</h2>
                <div>
                  <label className="input-label"><Lock className="inline w-3.5 h-3.5 mr-1" />Password</label>
                  <div className="relative">
                    <input required type={showPw ? "text" : "password"} autoComplete="new-password" className="input-field pr-10"
                      placeholder="Min. 6 characters" value={passwords.password} onChange={e => setPw("password", e.target.value)} />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="input-label">Confirm Password</label>
                  <input required type="password" autoComplete="new-password" className="input-field"
                    placeholder="Repeat password" value={passwords.confirmPassword} onChange={e => setPw("confirmPassword", e.target.value)} />
                </div>
                <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1.5 border border-slate-100">
                  <p className="font-semibold text-slate-700 mb-2">Registration Summary</p>
                  {[
                    ["Name", personal.name], ["Mobile", personal.mobile],
                    ["Specialty", professional.specialty], ["Experience", professional.experience + " yrs"],
                    ["Clinic Fee", "₹" + professional.consultFee], ["Home Visit Fee", "₹" + professional.homeVisitFee],
                    ["Home Visits", avail.homeVisits ? "Yes" : "No"], ["Teleconsult", avail.teleconsult ? "Yes" : "No"],
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
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                  : step === 5 ? <><CheckCircle className="w-4 h-4" /> Submit for Verification</>
                  : <>Next <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
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
