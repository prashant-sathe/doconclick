"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, Award, Hash, Briefcase, IndianRupee, MapPin, Clock,
  CreditCard, Camera, FileText, Shield, BadgeCheck, CheckCircle2,
  Save, ArrowRight, UploadCloud, Home, Navigation, Lock, Languages,
  QrCode, Copy, Check, Download,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import { computeDoctorCompleteness, type DoctorProfileData } from "@/lib/doctorProfileCompleteness";
import { useSpecialties } from "@/lib/useSpecialties";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import AddressAutocomplete from "@/components/patient/AddressAutocomplete";
import LocationPickerMap from "@/components/LocationPickerMap";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface FormState {
  specialty: string;
  qualification: string;
  languages: string;
  bio: string;
  medRegNo: string;
  experience: string;
  consultFee: string;
  videoFee: string;
  homeVisitFee: string;
  offersHomeVisit: boolean;
  radius: number;
  bankName: string;
  bankAccount: string;
  ifsc: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

const EMPTY_FORM: FormState = {
  specialty: "General Physician", qualification: "", languages: "", bio: "", medRegNo: "", experience: "",
  consultFee: "", videoFee: "", homeVisitFee: "", offersHomeVisit: true, radius: 10,
  bankName: "", bankAccount: "", ifsc: "", address: "", lat: null, lng: null,
};

function CompletionRing({ percent }: { percent: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg width="80" height="80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke={percent === 100 ? "#10b981" : "#0d9488"}
          strokeWidth="8" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-extrabold text-slate-900">{percent}%</span>
      </div>
    </div>
  );
}

function DocSlot({ label, icon: Icon, url, type, locked, onUploaded }: {
  label: string;
  icon: React.ElementType;
  url: string | null;
  type: string;
  locked?: boolean;
  onUploaded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("type", type);
    form.append("file", file);
    const res = await fetch("/api/doctors/me/documents", { method: "POST", body: form });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      const field = { photo: "photoUrl", medRegCert: "medRegCertUrl", degreeCert: "degreeCertUrl", kyc: "kycDocUrl" }[type] as string;
      onUploaded(data[field]);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Upload failed.");
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", url ? "bg-emerald-50" : "bg-slate-100")}>
          <Icon className={cn("w-4 h-4", url ? "text-emerald-600" : "text-slate-400")} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 font-medium hover:underline">Uploaded — view file</a>
          ) : (
            <p className="text-xs text-slate-400">Not uploaded yet</p>
          )}
          {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
        </div>
      </div>
      {locked ? (
        <span className="text-xs text-slate-400 font-semibold flex items-center gap-1 flex-shrink-0">
          <Lock className="w-3.5 h-3.5" /> Verified &amp; locked
        </span>
      ) : (
      <label className="btn-secondary py-1.5 px-3 text-xs cursor-pointer flex-shrink-0">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
        {url ? "Replace" : "Upload"}
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </label>
      )}
    </div>
  );
}

export default function DoctorProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { specialties } = useSpecialties();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [days, setDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [fromTime, setFromTime] = useState("09:00");
  const [toTime, setToTime] = useState("18:00");
  const [docs, setDocs] = useState({ photoUrl: null as string | null, medRegCertUrl: null as string | null, degreeCertUrl: null as string | null, kycDocUrl: null as string | null });
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/profile");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    fetch("/api/doctors/me")
      .then((r) => r.json())
      .then((d) => {
        const p = d.doctorProfile ?? {};
        if (!p.registrationFeePaid) { router.push("/doctor/payment"); return; }
        setForm({
          specialty: p.specialty ?? "General Physician",
          qualification: p.qualification ?? "",
          languages: p.languages ?? "",
          bio: p.bio ?? "",
          medRegNo: p.medRegNo ?? "",
          experience: p.experience ? String(p.experience) : "",
          consultFee: p.consultFee ? String(p.consultFee) : "",
          videoFee: p.videoFee ? String(p.videoFee) : "",
          homeVisitFee: p.homeVisitFee ? String(p.homeVisitFee) : "",
          offersHomeVisit: p.offersHomeVisit ?? true,
          radius: p.radius ?? 10,
          bankName: "", bankAccount: "", ifsc: "",
          address: p.address ?? "",
          lat: p.lat ?? null,
          lng: p.lng ?? null,
        });
        if (p.bankDetails) {
          const [bankName, bankAccount, ifscPart] = String(p.bankDetails).split(" | ");
          setForm((f) => ({ ...f, bankName: bankName ?? "", bankAccount: bankAccount ?? "", ifsc: (ifscPart ?? "").replace("IFSC: ", "") }));
        }
        if (p.availability) {
          const match = String(p.availability).match(/^(.+?)\s+(\d{1,2}:\d{2}(?:AM|PM)?)[–-](\d{1,2}:\d{2}(?:AM|PM)?)$/);
          if (match) {
            setDays(match[1].split(",").map((d: string) => d.trim()));
          }
        }
        setDocs({ photoUrl: p.photoUrl ?? null, medRegCertUrl: p.medRegCertUrl ?? null, degreeCertUrl: p.degreeCertUrl ?? null, kycDocUrl: p.kycDocUrl ?? null });
        setIsVerified(!!p.isVerified);
        setLoading(false);
      });
  }, [user, router]);

  const profileUrl = user ? `${window.location.origin}/patient/doctor/${user.id}` : "";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(`${window.location.origin}/patient/doctor/${user.id}`, { width: 220, margin: 1 })
    ).then((url) => { if (!cancelled) setQrDataUrl(url); });
    return () => { cancelled = true; };
  }, [user]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(profileUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const set = (k: keyof FormState, v: string | number | boolean | null) => { setSaved(false); setForm((f) => ({ ...f, [k]: v })); };
  const toggleDay = (d: string) => { setSaved(false); setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]); };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setSaved(false);
      setForm((f) => ({
        ...f,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        address: f.address || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
      }));
    });
  };

  const completenessInput: DoctorProfileData = {
    qualification: form.qualification || null,
    medRegNo: form.medRegNo || null,
    experience: Number(form.experience) || 0,
    consultFee: Number(form.consultFee) || 0,
    bankDetails: form.bankName && form.bankAccount ? "set" : null,
    photoUrl: docs.photoUrl,
    medRegCertUrl: docs.medRegCertUrl,
    degreeCertUrl: docs.degreeCertUrl,
    kycDocUrl: docs.kycDocUrl,
    lat: form.lat,
    lng: form.lng,
  };
  const completeness = computeDoctorCompleteness(completenessInput);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    const availability = days.length
      ? `${days.join(", ")} ${fromTime}–${toTime}`
      : "Mon-Fri, 9AM-6PM";
    const bankDetails = form.bankName || form.bankAccount || form.ifsc
      ? `${form.bankName} | ${form.bankAccount} | IFSC: ${form.ifsc}`
      : null;

    const res = await fetch("/api/doctors/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        specialty: form.specialty,
        qualification: form.qualification,
        languages: form.languages,
        bio: form.bio,
        medRegNo: form.medRegNo,
        experience: form.experience,
        consultFee: form.consultFee,
        videoFee: form.videoFee,
        homeVisitFee: form.homeVisitFee,
        offersHomeVisit: form.offersHomeVisit,
        radius: form.radius,
        availability,
        bankDetails,
        address: form.address,
        lat: form.lat,
        lng: form.lng,
      }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
    else setSaveError((await res.json().catch(() => ({}))).error ?? "Could not save your profile. Please try again.");
  };

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 flex items-center gap-5">
          <CompletionRing percent={completeness.percent} />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
              {completeness.percent === 100 ? "Your profile is complete!" : "Complete your consultation profile"}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {completeness.completedCount} of {completeness.totalCount} sections done
              {completeness.percent < 100 && " — verified doctors get more patients."}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {completeness.items.filter((i) => !i.done).slice(0, 3).map((i) => (
                <span key={i.label} className="badge badge-warning">{i.label}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end mb-6">
          <Link href="/doctor/dashboard" className="btn-secondary gap-1.5 text-sm">
            Continue to Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-teal-500" /> Your Booking QR Code
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Patients who scan this land straight on your public profile and can book an appointment with you — print it for your clinic or share the link.
          </p>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="w-[132px] h-[132px] rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-center flex-shrink-0">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="Your booking QR code" width={120} height={120} />
              ) : (
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1 w-full">
              <p className="text-xs font-semibold text-slate-500 mb-1">Public profile link</p>
              <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 break-all mb-3">{profileUrl}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyLink} className="btn-secondary py-2 px-3 text-xs">
                  {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {linkCopied ? "Copied" : "Copy Link"}
                </button>
                {qrDataUrl && (
                  <a href={qrDataUrl} download={`doconclick-qr-${user.id}.png`} className="btn-secondary py-2 px-3 text-xs">
                    <Download className="w-3.5 h-3.5" /> Download QR Code
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={submit} className="space-y-6">
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Award className="w-4 h-4 text-teal-500" /> Professional Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Specialty</label>
                  <select className="input-field" value={form.specialty} onChange={(e) => set("specialty", e.target.value)}>
                    {!specialties.some((s) => s.name === form.specialty) && form.specialty && (
                      <option value={form.specialty}>{form.specialty}</option>
                    )}
                    {specialties.map((s) => <option key={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label"><Briefcase className="inline w-3.5 h-3.5 mr-1" />Years of Experience</label>
                  <input type="number" min={0} className="input-field" placeholder="5" value={form.experience} onChange={(e) => set("experience", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="input-label">Qualification</label>
                <input className="input-field" placeholder="MBBS, MD" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} />
              </div>
              <div>
                <label className="input-label"><Languages className="inline w-3.5 h-3.5 mr-1" />Languages Spoken</label>
                <input className="input-field" placeholder="English, Hindi, Marathi" value={form.languages} onChange={(e) => set("languages", e.target.value)} />
              </div>
              <div>
                <label className="input-label"><FileText className="inline w-3.5 h-3.5 mr-1" />About You</label>
                <textarea
                  rows={3}
                  className="input-field resize-none"
                  placeholder="Tell patients a bit about your experience, approach to care, and specialties…"
                  value={form.bio}
                  onChange={(e) => set("bio", e.target.value)}
                />
              </div>
              <div>
                <label className="input-label"><Hash className="inline w-3.5 h-3.5 mr-1" />Medical Registration Number</label>
                <input className="input-field" placeholder="MCI-12345" value={form.medRegNo} onChange={(e) => set("medRegNo", e.target.value)} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-red-500" /> Practice Location</h2>
            <p className="text-xs text-slate-400 mb-4">Patients find you on the map using this location — without it, you won&apos;t appear in search even once verified.</p>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <AddressAutocomplete
                  placeholder="Search your clinic or practice address…"
                  value={form.address}
                  onChange={(v) => set("address", v)}
                  onSelect={(s) => setForm((f) => ({ ...f, lat: s.lat, lng: s.lon }))}
                />
              </div>
              <button type="button" onClick={useCurrentLocation} className="btn-secondary flex-shrink-0 px-3 text-xs gap-1 self-start">
                <Navigation className="w-3.5 h-3.5" /> Use Current
              </button>
            </div>
            <div className="mb-3">
              <LocationPickerMap
                lat={form.lat}
                lng={form.lng}
                onChange={(lat, lng) => {
                  setSaved(false);
                  setForm((f) => ({ ...f, lat, lng }));
                }}
              />
            </div>
            {form.lat != null && form.lng != null ? (
              <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Location set ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})
              </p>
            ) : (
              <p className="text-xs text-amber-600">No location set yet — search an address or use your current location.</p>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-emerald-500" /> Consultation Settings</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="input-label">Clinic Fee (₹)</label>
                  <input type="number" min={0} className="input-field" placeholder="500" value={form.consultFee} onChange={(e) => set("consultFee", e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Video Call Fee (₹)</label>
                  <input type="number" min={0} className="input-field" placeholder="400" value={form.videoFee} onChange={(e) => set("videoFee", e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Home Visit Fee (₹)</label>
                  <input type="number" min={0} className="input-field" placeholder="800" value={form.homeVisitFee} onChange={(e) => set("homeVisitFee", e.target.value)} />
                </div>
              </div>
              <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 cursor-pointer">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Home className="w-4 h-4 text-slate-400" /> Offer Home Visits</span>
                <input type="checkbox" checked={form.offersHomeVisit} onChange={(e) => set("offersHomeVisit", e.target.checked)} className="w-4 h-4 accent-teal-500" />
              </label>
              <div>
                <label className="input-label mb-2 flex items-center justify-between">
                  <span><MapPin className="inline w-3.5 h-3.5 mr-1" />Consultation Radius</span>
                  <span className="text-teal-600 font-bold">{form.radius} km</span>
                </label>
                <input type="range" min={5} max={20} step={1} value={form.radius}
                  onChange={(e) => set("radius", Number(e.target.value))}
                  className="w-full accent-teal-500" />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>5 km</span><span>20 km</span>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> Available Timings</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {DAYS.map((d) => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={cn("px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                    days.includes(d) ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  )}>
                  {d}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">From</label>
                <input type="time" className="input-field" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
              </div>
              <div>
                <label className="input-label">To</label>
                <input type="time" className="input-field" value={toTime} onChange={(e) => setToTime(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4 text-purple-500" /> Bank Details (for payouts)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="input-label">Bank Name</label>
                <input className="input-field" placeholder="HDFC Bank" value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
              </div>
              <div>
                <label className="input-label">Account Number</label>
                <input className="input-field" placeholder="XXXX XXXX XXXX" value={form.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} />
              </div>
              <div>
                <label className="input-label">IFSC Code</label>
                <input className="input-field" placeholder="HDFC0001234" value={form.ifsc} onChange={(e) => set("ifsc", e.target.value)} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-amber-500" /> Verification Documents</h2>
            <p className="text-xs text-slate-400 mb-4">Reviewed by our admin team. Your profile only appears to patients once verified.</p>
            {isVerified && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 mb-4 flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 flex-shrink-0" /> Your credentials are verified. Documents are locked and can no longer be changed.
              </div>
            )}
            <div className="space-y-3">
              <DocSlot label="Profile Photo" icon={Camera} url={docs.photoUrl} type="photo" onUploaded={(url) => setDocs((d) => ({ ...d, photoUrl: url }))} />
              <DocSlot label="Registration Certificate" icon={BadgeCheck} url={docs.medRegCertUrl} type="medRegCert" locked={isVerified} onUploaded={(url) => setDocs((d) => ({ ...d, medRegCertUrl: url }))} />
              <DocSlot label="Medical Degree Certificate" icon={FileText} url={docs.degreeCertUrl} type="degreeCert" locked={isVerified} onUploaded={(url) => setDocs((d) => ({ ...d, degreeCertUrl: url }))} />
              <DocSlot label="Government ID (KYC)" icon={Shield} url={docs.kycDocUrl} type="kyc" locked={isVerified} onUploaded={(url) => setDocs((d) => ({ ...d, kycDocUrl: url }))} />
            </div>
          </section>

          {saveError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{saveError}</div>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-3.5 text-base">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Profile</>}
          </button>
        </form>
      </div>
    </div>
  );
}
