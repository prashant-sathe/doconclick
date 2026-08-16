import Link from "next/link";
import { Heart, Mail, ArrowRight } from "lucide-react";

const footerLinks = {
  "Platform": [
    { href: "/", label: "Home" },
    { href: "/about", label: "About Us" },
    { href: "/contact", label: "Contact" },
    { href: "/login", label: "Sign In" },
  ],
  "For Patients": [
    { href: "/patient/register", label: "Register" },
    { href: "/patient/book", label: "Book Appointment" },
    { href: "/login", label: "Patient Login" },
  ],
  "For Doctors": [
    { href: "/doctor/register", label: "Join as Doctor" },
    { href: "/doctor/dashboard", label: "Doctor Dashboard" },
    { href: "/login", label: "Doctor Login" },
  ],
};

const SPECIALTIES = [
  "Cardiologist", "Dermatologist", "Pediatrician",
  "General Physician", "Orthopedic", "Neurologist",
];

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300">
      {/* Top CTA strip */}
      <div className="gradient-primary">
        <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Ready to book your doctor?</h2>
            <p className="text-blue-100 mt-1 text-sm">Get quality healthcare at your doorstep in minutes.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/patient/register" className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold rounded-xl px-6 py-3 text-sm hover:bg-blue-50 transition-all shadow-lg">
              Register as Patient <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/doctor/register" className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/30 text-white font-semibold rounded-xl px-6 py-3 text-sm hover:bg-white/20 transition-all">
              Join as Doctor
            </Link>
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-5">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-lg">
                <Heart className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-extrabold text-white text-lg leading-none">DocOnClick</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Healthcare Platform</div>
              </div>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-xs">
              India's most trusted on-demand healthcare platform. Connecting patients with verified doctors for home visits, video consultations, and clinic appointments.
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
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h3 className="text-white font-bold text-sm mb-4">{title}</h3>
              <ul className="space-y-2.5">
                {links.map(({ href, label }) => (
                  <li key={label}>
                    <Link href={href} className="text-slate-400 text-sm hover:text-white transition-colors hover:pl-1 duration-200 block">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Specialties strip */}
        <div className="mt-12 pt-8 border-t border-slate-800">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Popular Specialties</p>
          <div className="flex flex-wrap gap-2">
            {SPECIALTIES.map((s) => (
              <span key={s} className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-xs hover:bg-slate-700 hover:text-white transition-colors cursor-pointer">
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-6 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <p>© 2025 DocOnClick. All rights reserved. Built with ❤️ in India.</p>
          <div className="flex gap-5">
            <a href="#" className="hover:text-slate-300 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-slate-300 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-slate-300 transition-colors">Disclaimer</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
