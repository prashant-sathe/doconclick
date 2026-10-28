import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Heart, Shield, Target, Users, Award, Stethoscope, TrendingUp, Globe } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("public.about");
  return { title: t("metaTitle"), description: t("metaDescription"), alternates: { canonical: "/about" } };
}

const VALUES = [
  { icon: Heart,     key: "v1" },
  { icon: Shield,    key: "v2" },
  { icon: Target,    key: "v3" },
  { icon: TrendingUp,key: "v4" },
] as const;

export default async function AboutPage() {
  const t = await getTranslations("public.about");
  const td = (key: string) => t(key as never);
  const rich = { g: (chunks: React.ReactNode) => <span className="gradient-text">{chunks}</span> };
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="mx-auto max-w-7xl px-6 relative text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white mb-6 border border-white/20">
            <Globe className="w-4 h-4" /> {t("story")}
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6 max-w-3xl mx-auto">
            {t("heroTitle")}
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            {t("heroSub")}
          </p>
        </div>
        <div className="relative h-16">
          <svg viewBox="0 0 1440 64" fill="none" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,64 C360,0 1080,0 1440,64 L1440,64 L0,64 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="section-tag mb-4">{t("missionTag")}</div>
              <h2 className="text-4xl font-extrabold text-slate-900 mb-6">
                {t.rich("missionTitle", rich)}
              </h2>
              <p className="text-slate-600 leading-relaxed mb-5">
                {t("m1")}
              </p>
              <p className="text-slate-600 leading-relaxed mb-5">
                {t("m2")}
              </p>
              <p className="text-slate-600 leading-relaxed">
                {t("m3")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-5">
              {[
                { icon: Stethoscope, k: "boxClinic", bg: "bg-blue-600" },
                { icon: Users,       k: "boxHome",   bg: "bg-teal-500" },
                { icon: Globe,       k: "boxVideo",  bg: "bg-purple-600" },
                { icon: Award,       k: "boxLang",   bg: "bg-amber-500" },
              ].map(({ icon: Icon, k, bg }) => (
                <div key={k} className={`${bg} rounded-2xl p-8 text-white card-hover`}>
                  <Icon className="w-8 h-8 mb-3 opacity-80" />
                  <div className="text-3xl font-extrabold mb-1">{td(`${k}Value`)}</div>
                  <div className="text-sm opacity-80">{td(`${k}Label`)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Founder */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">{t("leadershipTag")}</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">{t.rich("founder", rich)}</h2>
          </div>
          <div className="max-w-sm mx-auto stat-card card-hover text-center">
            <Image
              src="/team/founder-kalpesh-kalyani.jpg"
              alt={t("founderPhotoAlt")}
              width={510}
              height={510}
              className="w-32 h-32 rounded-2xl object-cover mx-auto mb-5 shadow"
            />
            <h3 className="text-lg font-bold text-slate-900">{t("founderName")}</h3>
            <p className="text-sm font-semibold text-blue-600 mt-1">{t("founderRole")}</p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 gradient-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">{t("valuesTag")}</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">{t.rich("values", rich)}</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {VALUES.map(({ icon: Icon, key }) => (
              <div key={key} className="stat-card card-hover text-center">
                <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{td(`${key}Title`)}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{td(`${key}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
