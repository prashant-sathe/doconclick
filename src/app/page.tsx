"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Heart, ArrowRight, Star, CheckCircle2,
  Home as HomeIcon, Video, Building2, Shield, Clock, MapPin,
  Stethoscope, Brain, Bone, Baby, Eye, Ear, Pill, Zap,
  Users, CalendarCheck, Award, TrendingUp,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// ── Rotating taglines ──────────────────────────────────────────
const TAGLINES = [
  "Healthcare at Your Doorstep.",
  "Book Doctors. Anywhere. Anytime.",
  "Clinic, Home & Online Care in One Click.",
  "From Clinic to Home, We've Got You Covered.",
];

function RotatingTagline() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % TAGLINES.length); setVisible(true); }, 400);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <span
      className="gradient-text block"
      style={{ transition: "opacity 0.4s, transform 0.4s", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)" }}
    >
      {TAGLINES[idx]}
    </span>
  );
}

// ── Specialties ────────────────────────────────────────────────
const SPECIALTIES = [
  { icon: Heart,      label: "Cardiology",      color: "text-red-500",    bg: "bg-red-50" },
  { icon: Brain,      label: "Neurology",       color: "text-purple-500", bg: "bg-purple-50" },
  { icon: Bone,       label: "Orthopedics",     color: "text-amber-500",  bg: "bg-amber-50" },
  { icon: Baby,       label: "Pediatrics",      color: "text-pink-500",   bg: "bg-pink-50" },
  { icon: Eye,        label: "Ophthalmology",   color: "text-cyan-500",   bg: "bg-cyan-50" },
  { icon: Ear,        label: "ENT",             color: "text-teal-500",   bg: "bg-teal-50" },
  { icon: Pill,       label: "General Physician",color: "text-blue-500",   bg: "bg-blue-50" },
  { icon: Zap,        label: "Dermatology",     color: "text-orange-500", bg: "bg-orange-50" },
];

// ── How it works ───────────────────────────────────────────────
const HOW_STEPS = [
  { n: "01", title: "Register in 2 mins", desc: "Create your patient profile with basic details. No lengthy forms." },
  { n: "02", title: "Choose a Doctor",    desc: "Browse verified specialists. Filter by specialty, location & availability." },
  { n: "03", title: "Book Instantly",     desc: "Pick Home Visit, Video Call, or Clinic. Confirm in one click." },
  { n: "04", title: "Get Treated",        desc: "Your doctor arrives or connects on time. Pay securely online." },
];

// ── Testimonials ───────────────────────────────────────────────
const TESTIMONIALS = [
  { name: "Anita Sharma", role: "Patient, Mumbai", rating: 5, text: "Booked a home visit for my elderly mother at 10pm. Doctor arrived within 45 mins. Absolutely incredible service." },
  { name: "Rahul Mehta",  role: "Patient, Pune",   rating: 5, text: "Had a video consultation for my child's fever. Doctor prescribed medicine, sent it to the pharmacy — all in 20 minutes!" },
  { name: "Priya K.",     role: "Patient, Delhi",  rating: 5, text: "The convenience of having a cardiologist visit my home instead of waiting 3 hours at the clinic was life-changing." },
];

// ── Stats ──────────────────────────────────────────────────────
const STATS = [
  { value: "50,000+", label: "Happy Patients",   icon: Users },
  { value: "1,200+",  label: "Verified Doctors", icon: Stethoscope },
  { value: "98%",     label: "Satisfaction Rate", icon: Star },
  { value: "15 min",  label: "Avg Response Time", icon: Clock },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section className="pt-24 pb-0 gradient-hero overflow-hidden relative">
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        {/* Glow orbs */}
        <div className="absolute top-20 right-20 w-80 h-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-10 w-60 h-60 rounded-full bg-blue-400/20 blur-3xl" />

        <div className="mx-auto max-w-7xl px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[88vh]">
            {/* Left */}
            <div className="animate-fade-in-up">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white mb-6 backdrop-blur-sm border border-white/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Trusted by 50,000+ patients across India
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight mb-2">
                Your Health,
              </h1>
              <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6 min-h-[1.3em]">
                <RotatingTagline />
              </h1>
              <p className="text-xl text-blue-100 mb-10 max-w-lg leading-relaxed">
                Connect with verified doctors instantly — at your home, on video, or at the clinic. Quality healthcare has never been this simple.
              </p>
              <div className="flex flex-wrap gap-4 mb-10">
                <Link href="/patient/register" className="inline-flex items-center gap-2.5 bg-white text-blue-600 font-bold rounded-xl px-8 py-4 text-base hover:bg-blue-50 transition-all shadow-2xl hover:-translate-y-0.5">
                  Book a Doctor <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="/doctor/register" className="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur border border-white/30 text-white font-semibold rounded-xl px-8 py-4 text-base hover:bg-white/20 transition-all">
                  <Stethoscope className="w-5 h-5" /> Join as Doctor
                </Link>
              </div>
              {/* Trust pills */}
              <div className="flex flex-wrap gap-3">
                {["✓ Verified Doctors", "✓ 24/7 Available", "✓ Instant Booking", "✓ Secure Payments"].map(t => (
                  <span key={t} className="text-xs font-semibold text-blue-100 bg-white/10 rounded-full px-3 py-1.5 backdrop-blur">{t}</span>
                ))}
              </div>
            </div>

            {/* Right — floating card stack */}
            <div className="flex flex-col gap-4 items-center lg:items-end pb-8">
              {/* Consultation modes */}
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 w-full max-w-xs sm:max-w-sm lg:w-80 animate-float" style={{ animationDelay: "0s" }}>
                <p className="text-white font-bold mb-4 text-sm uppercase tracking-wider">Choose Consultation</p>
                {[
                  { icon: HomeIcon,  label: "Home Visit",   sub: "Doctor at your door", color: "bg-emerald-400" },
                  { icon: Video,     label: "Video Call",   sub: "Instant online consult", color: "bg-blue-400" },
                  { icon: Building2, label: "Clinic Visit", sub: "Book an appointment", color: "bg-purple-400" },
                ].map(({ icon: Icon, label, sub, color }) => (
                  <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer transition-all mb-2 last:mb-0">
                    <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div>
                      <div className="text-white text-sm font-semibold">{label}</div>
                      <div className="text-blue-200 text-xs">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Live stats card */}
              <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-xs sm:max-w-sm lg:w-72 animate-float" style={{ animationDelay: "0.5s" }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-700 font-bold text-sm">Live Activity</p>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                {[
                  { label: "Doctors online now", value: "247", color: "text-emerald-600" },
                  { label: "Appointments today", value: "1,832", color: "text-blue-600" },
                  { label: "Avg wait time", value: "< 15 min", color: "text-purple-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className={`text-sm font-bold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Wave separator */}
        <div className="relative h-16">
          <svg viewBox="0 0 1440 64" fill="none" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,64 C360,0 1080,0 1440,64 L1440,64 L0,64 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────────────────────── */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {STATS.map(({ value, label, icon: Icon }, i) => (
              <div key={label} className="stat-card text-center animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}>
                <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="text-3xl font-extrabold text-slate-900 mb-1">{value}</div>
                <div className="text-sm text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SPECIALTIES ────────────────────────────────────────── */}
      <section className="py-20 gradient-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12">
            <div className="section-tag mx-auto mb-4">Browse Specialties</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              Specialists for <span className="gradient-text">Every Need</span>
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">Find the right doctor across 25+ medical specialties. All verified, all available.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {SPECIALTIES.map(({ icon: Icon, label, color, bg }) => (
              <div key={label} className="specialty-card group">
                <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-7 h-7 ${color}`} />
                </div>
                <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{label}</span>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/patient/register" className="btn-secondary">
              View All Specialties <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">Simple Process</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              How <span className="gradient-text">DocOnClick</span> Works
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">From registration to treatment in under 5 minutes.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {HOW_STEPS.map(({ n, title, desc }, i) => (
              <div key={n} className="relative animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}>
                {i < HOW_STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-[calc(100%-16px)] w-8 h-0.5 bg-blue-100 z-10" />
                )}
                <div className="text-5xl font-extrabold gradient-text mb-4 leading-none">{n}</div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONSULTATION TYPES ───────────────────────────────────── */}
      <section className="py-20 gradient-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">Flexible Care</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              Three Ways to <span className="gradient-text">Get Treated</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: HomeIcon,  color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100", title: "Home Visit", desc: "A verified doctor visits you at your home. Perfect for elderly patients, post-surgery care, and urgent situations.", perks: ["Doctor arrives in 30-90 min", "Real-time tracking", "No travel needed"] },
              { icon: Video,     color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-100",    title: "Video Consultation", desc: "Consult top specialists from the comfort of your home via HD video. Get prescriptions and follow-ups online.", perks: ["Instant connection", "HD video call", "Digital prescription"] },
              { icon: Building2, color: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-100",  title: "Clinic Visit",  desc: "Book a confirmed slot at the doctor's clinic — zero waiting time. Walk in exactly when your appointment is.", perks: ["Zero waiting time", "Confirmed slot", "In-person examination"] },
            ].map(({ icon: Icon, color, bg, border, title, desc, perks }) => (
              <div key={title} className={`stat-card card-hover border ${border}`}>
                <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center mb-5`}>
                  <Icon className={`w-7 h-7 ${color}`} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-5">{desc}</p>
                <ul className="space-y-2">
                  {perks.map(p => (
                    <li key={p} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">Patient Stories</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              Loved by <span className="gradient-text">Thousands</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {TESTIMONIALS.map(({ name, role, rating, text }, i) => (
              <div key={name} className="stat-card card-hover animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}>
                <div className="flex mb-4">
                  {[...Array(rating)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-amber-400 fill-current" />
                  ))}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-5 italic">"{text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{name.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">{name}</div>
                    <div className="text-xs text-slate-400">{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY TRUST US ───────────────────────────────────────── */}
      <section className="py-20 gradient-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="section-tag mb-4">Why DocOnClick</div>
              <h2 className="text-4xl font-extrabold text-slate-900 mb-6">
                Healthcare you can <span className="gradient-text">Trust</span>
              </h2>
              <p className="text-slate-500 mb-8 leading-relaxed">
                Every doctor on DocOnClick goes through a rigorous 5-step verification process — degree verification, registration check, identity verification, background check, and in-person credential review.
              </p>
              <div className="space-y-4">
                {[
                  { icon: Shield, title: "5-Step Doctor Verification", desc: "Every doctor's credentials, registration, and identity are verified before they go live." },
                  { icon: Award,  title: "Only Qualified Specialists",  desc: "We list only MBBS, MD, MS and DNB qualified professionals." },
                  { icon: Clock,  title: "24/7 Availability",           desc: "Emergency? Our platform has doctors available around the clock." },
                  { icon: TrendingUp, title: "Real-time Monitoring",    desc: "Patient feedback is monitored continuously. Ratings below 4.0 are investigated." },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{title}</div>
                      <div className="text-slate-500 text-sm mt-0.5">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-5">
              {[
                { value: "100%", label: "Verified Doctors", color: "bg-blue-600" },
                { value: "50K+", label: "Consultations Done", color: "bg-teal-500" },
                { value: "4.9★", label: "Average Rating", color: "bg-amber-500" },
                { value: "30min", label: "Max Response Time", color: "bg-purple-600" },
              ].map(({ value, label, color }) => (
                <div key={label} className={`${color} rounded-2xl p-8 text-white text-center card-hover`}>
                  <div className="text-4xl font-extrabold mb-2">{value}</div>
                  <div className="text-sm font-medium opacity-80">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PORTAL CARDS ─────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12">
            <div className="section-tag mx-auto mb-4">Get Started</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              Join <span className="gradient-text">DocOnClick</span> Today
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              { title: "For Patients", icon: Heart, color: "text-blue-500", bg: "bg-blue-50", desc: "Register in 2 minutes. Book your first consultation today.", cta: "Register as Patient", href: "/patient/register" },
              { title: "For Doctors", icon: Stethoscope, color: "text-teal-500", bg: "bg-teal-50", desc: "Join 1,200+ verified doctors. Grow your practice with DocOnClick.", cta: "Join as Doctor", href: "/doctor/register" },
            ].map(({ title, icon: Icon, color, bg, desc, cta, href }) => (
              <div key={title} className="stat-card card-hover border border-slate-100 group">
                <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-7 h-7 ${color}`} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">{desc}</p>
                <Link href={href} className="btn-primary w-full justify-center">
                  {cta} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
