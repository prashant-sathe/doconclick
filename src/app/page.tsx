"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Heart, ArrowRight, CheckCircle2, Home as HomeIcon, Video, Building2, Shield, Clock, MapPin, Stethoscope, Brain, Bone, Baby, Eye, Ear, Pill, Zap, Users, CalendarCheck, Award, TrendingUp, HeartPulse,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// ── Rotating taglines ──────────────────────────────────────────
const TAGLINES = ["t1", "t2", "t3", "t4"] as const;

function RotatingTagline() {
  const t = useTranslations("public.home.taglines");
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
      {t(TAGLINES[idx])}
    </span>
  );
}

// ── Specialties ────────────────────────────────────────────────
const SPECIALTIES = [
  { icon: Heart,      key: "cardiology",      color: "text-red-500",    bg: "bg-red-50" },
  { icon: Brain,      key: "neurology", color: "text-purple-500", bg: "bg-purple-50" },
  { icon: Bone,       key: "orthopedics", color: "text-amber-500",  bg: "bg-amber-50" },
  { icon: Baby,       key: "pediatrics", color: "text-pink-500",   bg: "bg-pink-50" },
  { icon: Eye,        key: "ophthalmology", color: "text-cyan-500",   bg: "bg-cyan-50" },
  { icon: Ear,        key: "ent", color: "text-teal-500",   bg: "bg-teal-50" },
  { icon: Pill,       key: "general", color: "text-blue-500",   bg: "bg-blue-50" },
  { icon: Zap,        key: "dermatology", color: "text-orange-500", bg: "bg-orange-50" },
];

// ── How it works ───────────────────────────────────────────────
const HOW_STEPS = [
  { n: "01", key: "s1" },
  { n: "02", key: "s2" },
  { n: "03", key: "s3" },
  { n: "04", key: "s4" },
] as const;

// ── Highlights (feature-based; no unverified numbers) ──────────
const STATS = [
  { key: "ways", icon: Stethoscope },
  { key: "verified", icon: Shield },
  { key: "secure", icon: CheckCircle2 },
  { key: "multi", icon: Users },
] as const;

type PublicStats = { doctors: number | null; consultations: number | null; rating: number | null };

// Real counters, shown only for figures the API says are big enough to show.
function RealCounters() {
  const t = useTranslations("public.home.counters");
  const [stats, setStats] = useState<PublicStats | null>(null);
  useEffect(() => {
    fetch("/api/public-stats").then((r) => (r.ok ? r.json() : null)).then(setStats).catch(() => {});
  }, []);
  const items = [
    stats?.doctors != null && { value: `${stats.doctors}+`, label: t("doctors") },
    stats?.consultations != null && { value: `${stats.consultations}+`, label: t("consultations") },
    stats?.rating != null && { value: `${stats.rating}★`, label: t("rating") },
  ].filter(Boolean) as { value: string; label: string }[];
  if (items.length === 0) return null;
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-6">
      {items.map(({ value, label }) => (
        <div key={label} className="stat-card text-center px-8">
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-1 whitespace-nowrap">{value}</div>
          <div className="text-sm text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

const rich = { g: (chunks: React.ReactNode) => <span className="gradient-text">{chunks}</span> };

export default function Home() {
  const t = useTranslations("public.home");
  // Keys built from a list (k + suffix) can't be checked statically.
  const td = (key: string) => t(key as never);
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
          <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[70vh]">
            {/* Left */}
            <div className="animate-fade-in-up">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white mb-6 backdrop-blur-sm border border-white/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {t("hero.badge")}
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight mb-2">
                {t("hero.title")}
              </h1>
              <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6 min-h-[1.3em]">
                <RotatingTagline />
              </h1>
              <p className="text-xl text-blue-100 mb-10 max-w-lg leading-relaxed">
                {t("hero.sub")}
              </p>
              <div className="flex flex-wrap gap-4 mb-10">
                <Link href="/patient/register" className="inline-flex items-center gap-2.5 bg-white text-blue-600 font-bold rounded-xl px-8 py-4 text-base hover:bg-blue-50 transition-all shadow-2xl hover:-translate-y-0.5">
                  {t("hero.bookDoctor")} <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="/doctor/register" className="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur border border-white/30 text-white font-semibold rounded-xl px-8 py-4 text-base hover:bg-white/20 transition-all">
                  <Stethoscope className="w-5 h-5" /> {t("hero.joinDoctor")}
                </Link>
              </div>
              {/* Trust pills */}
              <div className="flex flex-wrap gap-3">
                {(["pillVerified", "pillInstant", "pillSecure"] as const).map(k => (
                  <span key={k} className="text-xs font-semibold text-blue-100 bg-white/10 rounded-full px-3 py-1.5 backdrop-blur">{td(`hero.${k}`)}</span>
                ))}
              </div>
            </div>

            {/* Right — floating card stack */}
            <div className="flex flex-col gap-4 items-center lg:items-end pb-8">
              {/* Consultation modes */}
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 w-full max-w-xs sm:max-w-sm lg:w-80 animate-float" style={{ animationDelay: "0s" }}>
                <p className="text-white font-bold mb-4 text-sm uppercase tracking-wider">{t("hero.chooseTitle")}</p>
                {[
                  { icon: HomeIcon,  k: "home",   color: "bg-emerald-400" },
                  { icon: Video,     k: "video",  color: "bg-blue-400" },
                  { icon: Building2, k: "clinic", color: "bg-purple-400" },
                ].map(({ icon: Icon, k, color }) => (
                  <div key={k} className="flex items-center gap-3 p-3 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer transition-all mb-2 last:mb-0">
                    <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div>
                      <div className="text-white text-sm font-semibold">{td(`hero.${k}Label`)}</div>
                      <div className="text-blue-200 text-xs">{td(`hero.${k}Sub`)}</div>
                    </div>
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
            {STATS.map(({ key, icon: Icon }, i) => (
              <div key={key} className="stat-card text-center animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}>
                <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="text-xl sm:text-3xl font-extrabold text-slate-900 mb-1">{td(`stats.${key}Value`)}</div>
                <div className="text-sm text-slate-500">{td(`stats.${key}Label`)}</div>
              </div>
            ))}
          </div>
          <RealCounters />
        </div>
      </section>

      {/* ── SPECIALTIES ────────────────────────────────────────── */}
      <section className="py-20 gradient-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12">
            <div className="section-tag mx-auto mb-4">{t("specSection.tag")}</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              {t.rich("specSection.title", rich)}
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t("specSection.sub")}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {SPECIALTIES.map(({ icon: Icon, key, color, bg }) => (
              <div key={key} className="specialty-card group">
                <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-7 h-7 ${color}`} />
                </div>
                <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{td(`specialties.${key}`)}</span>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/patient/register" className="btn-secondary">
              {t("specSection.viewAll")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">{t("howSection.tag")}</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              {t.rich("howSection.title", rich)}
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t("howSection.sub")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {HOW_STEPS.map(({ n, key }, i) => (
              <div key={n} className="relative animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}>
                {i < HOW_STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-[calc(100%-16px)] w-8 h-0.5 bg-blue-100 z-10" />
                )}
                <div className="text-5xl font-extrabold gradient-text mb-4 leading-none">{n}</div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{td(`how.${key}Title`)}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{td(`how.${key}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONSULTATION TYPES ───────────────────────────────────── */}
      <section className="py-20 gradient-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">{t("types.tag")}</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              {t.rich("types.title", rich)}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: HomeIcon,  color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100", k: "home" },
              { icon: Video,     color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-100",    k: "video" },
              { icon: Building2, color: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-100",  k: "clinic" },
            ].map(({ icon: Icon, color, bg, border, k }) => (
              <div key={k} className={`stat-card card-hover border ${border}`}>
                <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center mb-5`}>
                  <Icon className={`w-7 h-7 ${color}`} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{td(`types.${k}Title`)}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-5">{td(`types.${k}Desc`)}</p>
                <ul className="space-y-2">
                  {([1, 2, 3] as const).map(n => (
                    <li key={n} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> {td(`types.${k}Perk${n}`)}
                    </li>
                  ))}
                </ul>
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
              <div className="section-tag mb-4">{t("trust.tag")}</div>
              <h2 className="text-4xl font-extrabold text-slate-900 mb-6">
                {t.rich("trust.title", rich)}
              </h2>
              <p className="text-slate-500 mb-8 leading-relaxed">
                {t("trust.intro")}
              </p>
              <div className="space-y-4">
                {[
                  { icon: Shield, k: "f1" },
                  { icon: Award,  k: "f2" },
                  { icon: Clock,  k: "f3" },
                  { icon: TrendingUp, k: "f4" },
                ].map(({ icon: Icon, k }) => (
                  <div key={k} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{td(`trust.${k}Title`)}</div>
                      <div className="text-slate-500 text-sm mt-0.5">{td(`trust.${k}Desc`)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-5">
              {[
                { k: "boxClinic", color: "bg-blue-600" },
                { k: "boxHome", color: "bg-teal-500" },
                { k: "boxVideo", color: "bg-amber-500" },
                { k: "boxLang", color: "bg-purple-600" },
              ].map(({ k, color }) => (
                <div key={k} className={`${color} rounded-2xl p-8 text-white text-center card-hover`}>
                  <div className="text-4xl font-extrabold mb-2">{td(`trust.${k}Value`)}</div>
                  <div className="text-sm font-medium opacity-80">{td(`trust.${k}Label`)}</div>
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
            <div className="section-tag mx-auto mb-4">{t("join.tag")}</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              {t.rich("join.title", rich)}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { k: "patients", icon: Heart, color: "text-blue-500", bg: "bg-blue-50", href: "/patient/register" },
              { k: "doctors", icon: Stethoscope, color: "text-teal-500", bg: "bg-teal-50", href: "/doctor/register" },
              { k: "nurses", icon: HeartPulse, color: "text-rose-500", bg: "bg-rose-50", href: "/nurse/register" },
            ].map(({ k, icon: Icon, color, bg, href }) => (
              <div key={k} className="stat-card card-hover border border-slate-100 group">
                <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-7 h-7 ${color}`} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{td(`join.${k}Title`)}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">{td(`join.${k}Desc`)}</p>
                <Link href={href} className="btn-primary w-full justify-center">
                  {td(`join.${k}Cta`)} <ArrowRight className="w-4 h-4" />
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
