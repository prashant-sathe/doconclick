import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Heart, Shield, Target, Users, Award, Stethoscope, TrendingUp, Globe } from "lucide-react";

export const metadata = { title: "About Us | DocOnClick", description: "Learn about DocOnClick's mission to make quality healthcare accessible to every Indian." };

const TEAM = [
  { name: "Dr. Arjun Mehta",  role: "Co-Founder & CMO",         spec: "Cardiologist, 15 yrs exp",    initial: "A" },
  { name: "Priya Rajan",      role: "Co-Founder & CEO",          spec: "Health-Tech Entrepreneur",    initial: "P" },
  { name: "Ravi Kumar",       role: "CTO",                       spec: "Ex-Google, Healthcare AI",    initial: "R" },
  { name: "Sunita Nair",      role: "Head of Doctor Relations",  spec: "Healthcare Management, 10 yrs", initial: "S" },
];

const VALUES = [
  { icon: Heart,     title: "Patient First",         desc: "Every decision we make starts with one question: does this make the patient's life better?" },
  { icon: Shield,    title: "Trust & Safety",         desc: "Zero-compromise on doctor verification. Every credential checked. Every time." },
  { icon: Target,    title: "Accessibility",          desc: "Quality healthcare for every Indian — regardless of income, location, or time of day." },
  { icon: TrendingUp,title: "Continuous Innovation", desc: "We never stop improving. AI, predictive health, digital prescriptions — we're building the future." },
];

const MILESTONES = [
  { year: "2022", event: "DocOnClick founded in Mumbai" },
  { year: "2022", event: "Launched pilot with 20 doctors in Mumbai" },
  { year: "2023", event: "Expanded to Delhi, Bengaluru, Pune" },
  { year: "2023", event: "Crossed 10,000 successful consultations" },
  { year: "2024", event: "1,000+ verified doctors onboarded" },
  { year: "2025", event: "50,000+ patients. ₹5Cr+ earned by doctors" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="mx-auto max-w-7xl px-6 relative text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white mb-6 border border-white/20">
            <Globe className="w-4 h-4" /> Our Story
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6 max-w-3xl mx-auto">
            Building India's Most Trusted Healthcare Platform
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            We started with a simple belief: no one should have to wait hours in a crowded clinic when they're sick. DocOnClick was born to change that.
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
              <div className="section-tag mb-4">Our Mission</div>
              <h2 className="text-4xl font-extrabold text-slate-900 mb-6">
                Healthcare that comes <span className="gradient-text">to you</span>
              </h2>
              <p className="text-slate-600 leading-relaxed mb-5">
                In 2022, our founders — a cardiologist and a tech entrepreneur — saw the same problem from different sides: patients struggling to access doctors, and good doctors struggling to reach patients who need them most.
              </p>
              <p className="text-slate-600 leading-relaxed mb-5">
                DocOnClick bridges that gap. We've built a platform that makes it as easy to book a doctor as it is to order food — with the trust, safety, and professionalism that healthcare demands.
              </p>
              <p className="text-slate-600 leading-relaxed">
                Today, we operate across 10+ cities, with 1,200+ verified doctors and have powered 50,000+ consultations. Our mission remains unchanged: make quality healthcare accessible to every Indian.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-5">
              {[
                { icon: Users,       value: "50,000+", label: "Patients Served",   bg: "bg-blue-600" },
                { icon: Stethoscope, value: "1,200+",  label: "Verified Doctors",  bg: "bg-teal-500" },
                { icon: Globe,       value: "10+",     label: "Cities Active",     bg: "bg-purple-600" },
                { icon: Award,       value: "4.9/5",   label: "Patient Rating",    bg: "bg-amber-500" },
              ].map(({ icon: Icon, value, label, bg }) => (
                <div key={label} className={`${bg} rounded-2xl p-8 text-white card-hover`}>
                  <Icon className="w-8 h-8 mb-3 opacity-80" />
                  <div className="text-3xl font-extrabold mb-1">{value}</div>
                  <div className="text-sm opacity-80">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 gradient-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">What Drives Us</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Our Core <span className="gradient-text">Values</span></h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="stat-card card-hover text-center">
                <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">Our Journey</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">From an Idea to <span className="gradient-text">50,000 Lives Touched</span></h2>
          </div>
          <div className="relative">
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-blue-100" />
            <div className="space-y-8">
              {MILESTONES.map(({ year, event }, i) => (
                <div key={i} className="flex items-start gap-8 animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}>
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center shadow-lg">
                      <span className="text-white text-xs font-bold">{year}</span>
                    </div>
                  </div>
                  <div className="stat-card flex-1 mt-3">
                    <p className="text-slate-700 font-medium">{event}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 gradient-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="section-tag mx-auto mb-4">The People Behind DocOnClick</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Meet the <span className="gradient-text">Team</span></h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {TEAM.map(({ name, role, spec, initial }) => (
              <div key={name} className="stat-card card-hover text-center">
                <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center mx-auto mb-4 text-2xl font-extrabold text-white shadow-lg">
                  {initial}
                </div>
                <h3 className="font-bold text-slate-900 mb-1">{name}</h3>
                <p className="text-blue-600 text-sm font-semibold mb-1">{role}</p>
                <p className="text-slate-400 text-xs">{spec}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
