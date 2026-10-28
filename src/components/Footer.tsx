import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Mail, ArrowRight } from "lucide-react";

const FOOTER_LINKS = [
  { title: "groupPlatform", links: [
    { href: "/", key: "linkHome" },
    { href: "/about", key: "linkAbout" },
    { href: "/contact", key: "linkContact" },
    { href: "/login", key: "linkSignIn" },
  ] },
  { title: "groupPatients", links: [
    { href: "/patient/register", key: "linkRegister" },
    { href: "/patient/book", key: "linkBook" },
    { href: "/login", key: "linkPatientLogin" },
  ] },
  { title: "groupDoctors", links: [
    { href: "/doctor/register", key: "linkJoinDoctor" },
    { href: "/doctor/dashboard", key: "linkDoctorDashboard" },
    { href: "/login", key: "linkDoctorLogin" },
  ] },
] as const;

const SPECIALTIES = [
  "spCardiologist", "spDermatologist", "spPediatrician",
  "spGeneral", "spOrthopedic", "spNeurologist",
] as const;

export default function Footer() {
  const t = useTranslations("public.footer");
  return (
    <footer className="bg-slate-900 text-slate-300">
      {/* Top CTA strip */}
      <div className="gradient-primary">
        <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-extrabold text-white">{t("ctaTitle")}</h2>
            <p className="text-blue-100 mt-1 text-sm">{t("ctaSub")}</p>
          </div>
          <div className="flex gap-3">
            <Link href="/patient/register" className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold rounded-xl px-6 py-3 text-sm hover:bg-blue-50 transition-all shadow-lg">
              {t("registerPatient")} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/doctor/register" className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/30 text-white font-semibold rounded-xl px-6 py-3 text-sm hover:bg-white/20 transition-all">
              {t("joinDoctor")}
            </Link>
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center mb-5">
              <Image src="/logo-dark.png" alt="DocOnClick" width={1200} height={242} className="h-9 w-auto" />
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-xs">
              {t("tagline")}
            </p>
            <div className="space-y-2 text-sm">
              <a href="mailto:support@doconclick.com" className="flex items-center gap-2.5 text-slate-400 hover:text-white transition-colors">
                <Mail className="w-4 h-4 text-blue-400" /> support@doconclick.com
              </a>
            </div>
            {/* Social */}
            <div className="flex gap-2 mt-6">
              {[
                { label: "f", href: "#", title: "Facebook" },
                { label: "𝕏", href: "#", title: "X / Twitter" },
                { label: "in", href: "#", title: "Instagram" },
                { label: "li", href: "#", title: "LinkedIn" },
              ].map(({ label, href, title }) => (
                <a key={title} href={href} title={title} className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-blue-600 transition-all duration-200 text-xs font-bold">
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {FOOTER_LINKS.map(({ title, links }) => (
            <div key={title}>
              <h3 className="text-white font-bold text-sm mb-4">{t(title)}</h3>
              <ul className="space-y-2.5">
                {links.map(({ href, key }) => (
                  <li key={key}>
                    <Link href={href} className="text-slate-400 text-sm hover:text-white transition-colors hover:pl-1 duration-200 block">
                      {t(key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Specialties strip */}
        <div className="mt-12 pt-8 border-t border-slate-800">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">{t("popularSpecialties")}</p>
          <div className="flex flex-wrap gap-2">
            {SPECIALTIES.map((s) => (
              <span key={s} className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-xs hover:bg-slate-700 hover:text-white transition-colors cursor-pointer">
                {t(s)}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-6 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <p>{t("copyright")}</p>
          <div className="flex gap-5">
            <Link href="/privacy-policy#privacy-policy" className="hover:text-slate-300 transition-colors">{t("privacy")}</Link>
            <Link href="/privacy-policy#terms-of-service" className="hover:text-slate-300 transition-colors">{t("terms")}</Link>
            <Link href="/data-deletion" className="hover:text-slate-300 transition-colors">{t("deleteData")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
