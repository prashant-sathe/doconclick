"use client";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Mail, Clock, MessageCircle, Headphones, Send, CheckCircle, Loader2 } from "lucide-react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", mobile: "", subject: "", message: "", type: "general" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setTimeout(() => { setSending(false); setSent(true); }, 1800);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="mx-auto max-w-7xl px-6 relative text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white mb-6 border border-white/20">
            <MessageCircle className="w-4 h-4" /> Get In Touch
          </div>
          <h1 className="text-5xl font-extrabold text-white mb-4">Contact Us</h1>
          <p className="text-xl text-blue-100 max-w-xl mx-auto">We're here to help — patients, doctors, and partners. Reach out and we'll respond within 24 hours.</p>
        </div>
        <div className="relative h-16">
          <svg viewBox="0 0 1440 64" fill="none" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,64 C360,0 1080,0 1440,64 L1440,64 L0,64 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* Main */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-5 gap-12">
            {/* Contact info */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Let's talk</h2>
                <p className="text-slate-500 text-sm leading-relaxed">Whether you have a question about our services, pricing, or need technical support — our team is ready to answer all your questions.</p>
              </div>
              {[
                { icon: Mail,    title: "Email",           info: "support@doconclick.com",     sub: "We reply within 24 hours",  color: "text-teal-500",   bg: "bg-teal-50" },
                { icon: Clock,   title: "Working Hours",   info: "Mon – Sat: 8AM – 10PM",     sub: "Sun: 10AM – 6PM",           color: "text-amber-500",  bg: "bg-amber-50" },
              ].map(({ icon: Icon, title, info, sub, color, bg }) => (
                <div key={title} className="stat-card flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{title}</div>
                    <div className="text-slate-700 text-sm mt-0.5">{info}</div>
                    <div className="text-slate-400 text-xs mt-0.5">{sub}</div>
                  </div>
                </div>
              ))}

              {/* Support types */}
              <div className="stat-card">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-blue-500" /> Support Channels
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Patient Support",  desc: "Booking, payments, refunds" },
                    { label: "Doctor Onboarding", desc: "Registration, verification, payout" },
                    { label: "Technical Issues",  desc: "App bugs, account issues" },
                    { label: "Partnership",       desc: "Hospital tie-ups, corporate wellness" },
                  ].map(({ label, desc }) => (
                    <div key={label} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-slate-700">{label}</div>
                        <div className="text-xs text-slate-400">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Contact form */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
                {sent ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                      <CheckCircle className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Message Sent!</h2>
                    <p className="text-slate-500 mb-6">Thank you for reaching out. Our team will get back to you within 24 hours.</p>
                    <button onClick={() => { setSent(false); setForm({ name: "", email: "", mobile: "", subject: "", message: "", type: "general" }); }} className="btn-secondary">
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl font-extrabold text-slate-900 mb-6">Send us a message</h2>
                    <form onSubmit={submit} className="space-y-5">
                      {/* Query type */}
                      <div>
                        <label className="input-label">I'm a…</label>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { id: "general", label: "Patient / Public" },
                            { id: "doctor",  label: "Doctor" },
                            { id: "partner", label: "Business Partner" },
                          ].map(({ id, label }) => (
                            <button
                              key={id} type="button" onClick={() => set("type", id)}
                              className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${form.type === id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="input-label">Full Name</label>
                          <input required className="input-field" placeholder="John Doe" value={form.name} onChange={e => set("name", e.target.value)} />
                        </div>
                        <div>
                          <label className="input-label">Mobile</label>
                          <input className="input-field" placeholder="9800000000" value={form.mobile} onChange={e => set("mobile", e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="input-label">Email Address</label>
                        <input required type="email" className="input-field" placeholder="you@email.com" value={form.email} onChange={e => set("email", e.target.value)} />
                      </div>
                      <div>
                        <label className="input-label">Subject</label>
                        <input required className="input-field" placeholder="How can we help?" value={form.subject} onChange={e => set("subject", e.target.value)} />
                      </div>
                      <div>
                        <label className="input-label">Message</label>
                        <textarea required rows={5} className="input-field resize-none" placeholder="Tell us more about your query…" value={form.message} onChange={e => set("message", e.target.value)} />
                      </div>
                      <button type="submit" disabled={sending} className="btn-primary w-full justify-center py-3.5 text-base">
                        {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send Message</>}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
