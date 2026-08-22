"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, Award, Hash, Briefcase, IndianRupee, MapPin, Clock,
  CreditCard, Camera, FileText, Shield, BadgeCheck, CheckCircle2,
  Save, ArrowRight, UploadCloud, Home, Lock, Languages,
  QrCode, Copy, Check, Download, Building2,
  ShieldCheck, AlertTriangle, Video,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn, formatDoctorName } from "@/lib/utils";
import { computeDoctorCompleteness, type DoctorProfileData } from "@/lib/doctorProfileCompleteness";
import { useSpecialties } from "@/lib/useSpecialties";
import { hasActiveDoctorSubscription } from "@/lib/subscription";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";

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
  offersClinic: boolean;
  offersVideo: boolean;
  radius: number;
  bankName: string;
  bankAccount: string;
  ifsc: string;
}

function daysUntil(target: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86400000));
}

const EMPTY_FORM: FormState = {
  specialty: "General Physician", qualification: "", languages: "", bio: "", medRegNo: "", experience: "",
  consultFee: "", videoFee: "", homeVisitFee: "", offersHomeVisit: true, offersClinic: true, offersVideo: false, radius: 10,
  bankName: "", bankAccount: "", ifsc: "",
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

function DocSlot({ label, icon: Icon, url, type, locked, required, onUploaded }: {
  label: string;
  icon: React.ElementType;
  url: string | null;
  type: string;
  locked?: boolean;
  required?: boolean;
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
        {type === "photo" && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profile photo" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-slate-200" />
        ) : (
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", url ? "bg-emerald-50" : "bg-slate-100")}>
            <Icon className={cn("w-4 h-4", url ? "text-emerald-600" : "text-slate-400")} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {label} {required && <span className="text-red-500">*</span>}
          </p>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 font-medium hover:underline">Uploaded — view file</a>
          ) : required ? (
            <p className="text-xs text-red-600 font-semibold">Required to get verified — not uploaded yet</p>
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
  const [clinicCount, setClinicCount] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  const [registrationFeePaid, setRegistrationFeePaid] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [subscriptionPaidUntil, setSubscriptionPaidUntil] = useState<string | null>(null);
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
          offersClinic: p.offersClinic ?? true,
          offersVideo: p.offersVideo ?? false,
          radius: p.radius ?? 10,
          bankName: "", bankAccount: "", ifsc: "",
        });
        if (p.bankDetails) {
          const [bankName, bankAccount, ifscPart] = String(p.bankDetails).split(" | ");
          setForm((f) => ({ ...f, bankName: bankName ?? "", bankAccount: bankAccount ?? "", ifsc: (ifscPart ?? "").replace("IFSC: ", "") }));
        }
        if (p.availability) {
          const match = String(p.availability).match(/^(.+?)\s+(\d{1,2}:\d{2})(?:AM|PM)?[–-](\d{1,2}:\d{2})(?:AM|PM)?$/);
          if (match) {
            setDays(match[1].split(",").map((d: string) => d.trim()));
            setFromTime(match[2]);
            setToTime(match[3]);
          }
        }
        setDocs({ photoUrl: p.photoUrl ?? null, medRegCertUrl: p.medRegCertUrl ?? null, degreeCertUrl: p.degreeCertUrl ?? null, kycDocUrl: p.kycDocUrl ?? null });
        setClinicCount(d.clinics?.length ?? 0);
        setIsVerified(!!p.isVerified);
        setRegistrationFeePaid(!!p.registrationFeePaid);
        setTrialEndsAt(p.trialEndsAt ?? null);
        setSubscriptionPaidUntil(p.subscriptionPaidUntil ?? null);
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

  const downloadBrandedQR = () => {
    if (!qrDataUrl || !user) return;
    const W = 420, H = 560, QR_SIZE = 300, QR_Y = 155;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";

    ctx.fillStyle = "#0d9488";
    ctx.font = "bold 28px Arial, sans-serif";
    ctx.fillText("DocOnClick", W / 2, 50);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 24px Arial, sans-serif";
    ctx.fillText(formatDoctorName(user.name), W / 2, 95);

    if (form.specialty) {
      ctx.fillStyle = "#64748b";
      ctx.font = "16px Arial, sans-serif";
      ctx.fillText(form.specialty, W / 2, 122);
    }

    const qrImg = new Image();
    qrImg.onload = () => {
      const qrX = (W - QR_SIZE) / 2;
      ctx.drawImage(qrImg, qrX, QR_Y, QR_SIZE, QR_SIZE);

      ctx.fillStyle = "#475569";
      ctx.font = "16px Arial, sans-serif";
      ctx.fillText("Scan to book an appointment", W / 2, QR_Y + QR_SIZE + 35);

      const link = document.createElement("a");
      link.download = `doconclick-qr-${user.id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    qrImg.src = qrDataUrl;
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(profileUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const set = (k: keyof FormState, v: string | number | boolean | null) => { setSaved(false); setForm((f) => ({ ...f, [k]: v })); };
  const toggleDay = (d: string) => { setSaved(false); setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]); };

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
    hasClinic: clinicCount > 0,
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
        offersClinic: form.offersClinic,
        offersVideo: form.offersVideo,
        radius: form.radius,
        availability,
        bankDetails,
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

        {!registrationFeePaid && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">Verify your account &amp; start onboarding patients</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  Fill in your profile below, then pay a one-time <span className="line-through text-slate-400">₹499</span> <span className="font-semibold text-slate-700">₹99</span> to activate your dashboard.
                </p>
              </div>
            </div>
            <Link href="/doctor/payment" className="btn-primary py-2.5 px-4 text-sm flex-shrink-0">
              <CreditCard className="w-4 h-4" /> Pay ₹99
            </Link>
          </div>
        )}

        {registrationFeePaid && !hasActiveDoctorSubscription({ trialEndsAt, subscriptionPaidUntil }) && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">Your plan has expired</p>
                <p className="text-sm text-slate-500 mt-0.5">Renew for ₹499/month to keep seeing and managing patients.</p>
              </div>
            </div>
            <Link href="/doctor/subscribe" className="btn-primary py-2.5 px-4 text-sm flex-shrink-0">
              <CreditCard className="w-4 h-4" /> Renew ₹499
            </Link>
          </div>
        )}

        {registrationFeePaid && hasActiveDoctorSubscription({ trialEndsAt, subscriptionPaidUntil }) && (() => {
          const isTrial = !!trialEndsAt && (!subscriptionPaidUntil || new Date(trialEndsAt) > new Date(subscriptionPaidUntil));
          const target = new Date(isTrial ? trialEndsAt! : subscriptionPaidUntil!);
          const daysLeft = daysUntil(target);
          const urgency = daysLeft <= 2 ? "danger" : daysLeft <= 7 ? "warning" : "success";
          return (
            <div className={cn(
              "rounded-2xl p-5 mb-6 flex items-center justify-between gap-4 flex-wrap border",
              urgency === "danger" ? "bg-red-50 border-red-200" : urgency === "warning" ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
            )}>
              <div className="flex items-start gap-3">
                <CheckCircle2 className={cn(
                  "w-5 h-5 flex-shrink-0 mt-0.5",
                  urgency === "danger" ? "text-red-600" : urgency === "warning" ? "text-amber-600" : "text-emerald-600"
                )} />
                <div>
                  <p className="font-bold text-slate-900">{isTrial ? "Free trial active" : "Plan active"}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {isTrial ? "Ends" : "Renews by"} {target.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </p>
                </div>
              </div>
              <span className={cn("badge", urgency === "danger" ? "badge-danger" : urgency === "warning" ? "badge-warning" : "badge-success")}>
                {daysLeft === 0 ? "Expires today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
              </span>
            </div>
          );
        })()}

        <div className="flex justify-end mb-6">
          <Link href="/doctor/dashboard" className="btn-secondary gap-1.5 text-sm">
            Continue to Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <section className="relative group bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 overflow-hidden">
          <div className={isVerified ? undefined : "blur-[2px] select-none pointer-events-none"}>
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
                    <button type="button" onClick={downloadBrandedQR} className="btn-secondary py-2 px-3 text-xs">
                      <Download className="w-3.5 h-3.5" /> Download QR Code
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!isVerified && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-2 bg-slate-900 text-white text-xs font-medium rounded-full px-4 py-2 shadow-lg text-center max-w-[85%]">
                <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                This will unlock once your profile is verified
              </div>
            </div>
          )}
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
            <p className="text-sm text-slate-500 mb-4">
              Your clinic locations, photos, and day-wise hours are managed on the Clinics page — patients find you on the map using those locations.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                {clinicCount === 0
                  ? "No clinics set up yet"
                  : `${clinicCount} clinic${clinicCount === 1 ? "" : "s"} set up`}
              </span>
              <Link href="/doctor/clinics" className="btn-secondary py-1.5 px-3 text-xs flex-shrink-0">
                Manage Clinics <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
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
              <div className="space-y-2">
                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Building2 className="w-4 h-4 text-slate-400" /> Offer Clinic Visits</span>
                  <input type="checkbox" checked={form.offersClinic} onChange={(e) => set("offersClinic", e.target.checked)} className="w-4 h-4 accent-teal-500" />
                </label>
                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Home className="w-4 h-4 text-slate-400" /> Offer Home Visits</span>
                  <input type="checkbox" checked={form.offersHomeVisit} onChange={(e) => set("offersHomeVisit", e.target.checked)} className="w-4 h-4 accent-teal-500" />
                </label>
                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Video className="w-4 h-4 text-slate-400" /> Offer Video Call Consultation</span>
                  <input type="checkbox" checked={form.offersVideo} onChange={(e) => set("offersVideo", e.target.checked)} className="w-4 h-4 accent-teal-500" />
                </label>
              </div>
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
            <p className="text-xs text-slate-400 mb-4">
              Applies only to Home Visit and Video Call requests. Clinic Visit hours are set separately for each clinic on the Clinics page.
            </p>
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
            {isVerified ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 mb-4 flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 flex-shrink-0" /> Your credentials are verified. Documents are locked and can no longer be changed.
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-4">
                The 3 documents marked <span className="text-red-500 font-bold">*</span> below are mandatory to verify your profile — your profile only appears to patients once verified. Upload them first so our admin team can verify you.
              </div>
            )}
            <div className="space-y-3">
              <DocSlot label="Profile Photo" icon={Camera} url={docs.photoUrl} type="photo" onUploaded={(url) => setDocs((d) => ({ ...d, photoUrl: url }))} />
              <DocSlot label="Registration Certificate" icon={BadgeCheck} url={docs.medRegCertUrl} type="medRegCert" locked={isVerified} required onUploaded={(url) => setDocs((d) => ({ ...d, medRegCertUrl: url }))} />
              <DocSlot label="Medical Degree Certificate" icon={FileText} url={docs.degreeCertUrl} type="degreeCert" locked={isVerified} required onUploaded={(url) => setDocs((d) => ({ ...d, degreeCertUrl: url }))} />
              <DocSlot label="Government ID (KYC)" icon={Shield} url={docs.kycDocUrl} type="kyc" locked={isVerified} required onUploaded={(url) => setDocs((d) => ({ ...d, kycDocUrl: url }))} />
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
