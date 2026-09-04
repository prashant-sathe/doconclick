"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, Award, IndianRupee, Clock, Building2, Shield, CreditCard, QrCode,
  Bell, LifeBuoy, ChevronRight, Check, Camera, LogOut, User, CheckCircle2,
  ShieldCheck, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn, formatDoctorName } from "@/lib/utils";
import { computeDoctorCompleteness } from "@/lib/doctorProfileCompleteness";
import { hasActiveDoctorSubscription } from "@/lib/subscription";
import { useDoctorProfile } from "@/lib/useDoctorProfile";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import ImageCropModal from "@/components/ImageCropModal";

function daysUntil(target: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86400000));
}

function AvatarEditor({ url, onChange }: { url: string | null; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const upload = async (blob: Blob) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("type", "photo");
    fd.append("file", blob, "photo.jpg");
    const res = await fetch("/api/doctors/me/documents", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) onChange((await res.json()).photoUrl);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-16 h-16 rounded-full flex-shrink-0 overflow-hidden bg-slate-100 border border-slate-200"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <User className="w-7 h-7 text-slate-300 absolute inset-0 m-auto" />
        )}
        <span className="absolute bottom-0 inset-x-0 h-6 bg-black/35 flex items-center justify-center">
          {busy ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Camera className="w-3 h-3 text-white" />}
        </span>
      </button>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }} />
      {pendingFile && (
        <ImageCropModal
          file={pendingFile}
          aspect={1}
          round
          onCancel={() => setPendingFile(null)}
          onConfirm={(blob) => { setPendingFile(null); upload(blob); }}
        />
      )}
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">{label}</p>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
        {children}
      </div>
    </div>
  );
}

function Row({ href, icon, tint, title, trailing }: {
  href: string; icon: React.ReactNode; tint: string; title: string; trailing?: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
      <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", tint)}>{icon}</span>
      <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">{title}</span>
      {trailing}
      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </Link>
  );
}

function Status({ done }: { done: boolean }) {
  return done
    ? <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
    : <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />;
}

export default function DoctorProfilePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { profile, clinicCount, loading } = useDoctorProfile();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/profile");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (profile?.photoUrl !== undefined) setPhotoUrl(profile?.photoUrl ?? null);
  }, [profile]);

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  const p = profile ?? {};
  const completeness = computeDoctorCompleteness({
    qualification: p.qualification ?? null,
    medRegNo: p.medRegNo ?? null,
    experience: p.experience ?? 0,
    consultFee: p.consultFee ?? 0,
    bankDetails: p.bankDetails ?? null,
    photoUrl: photoUrl,
    medRegCertUrl: p.medRegCertUrl ?? null,
    degreeCertUrl: p.degreeCertUrl ?? null,
    kycDocUrl: p.kycDocUrl ?? null,
    hasClinic: clinicCount > 0,
  });
  const done = (label: string) => completeness.items.find((i) => i.label === label)?.done ?? false;

  const professionalDone = done("Qualification") && done("Registration Number");
  const consultationDone = done("Experience & Fees");
  const docsDone = ["Profile Photo", "Registration Certificate", "Medical Degree Certificate", "KYC Document"].every(done);

  const registrationFeePaid = !!p.registrationFeePaid;
  const trialEndsAt = (p.trialEndsAt as string | null) ?? null;
  const subscriptionPaidUntil = (p.subscriptionPaidUntil as string | null) ?? null;
  const subActive = hasActiveDoctorSubscription({ trialEndsAt, subscriptionPaidUntil });

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-xl mx-auto py-6 px-4 sm:px-6">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4 flex items-center gap-4">
          <AvatarEditor url={photoUrl} onChange={(u) => setPhotoUrl(u || null)} />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold text-slate-900 truncate">{formatDoctorName(user.name)}</h1>
            <p className="text-sm text-slate-500 truncate">{p.specialty ?? "Specialty not set"}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", completeness.percent === 100 ? "bg-emerald-500" : "bg-teal-500")}
                  style={{ width: `${completeness.percent}%` }} />
              </div>
              <span className="text-xs font-semibold text-slate-500 flex-shrink-0">
                {completeness.percent === 100 ? "Complete" : `${completeness.percent}%`}
              </span>
            </div>
          </div>
        </div>

        {/* Account status */}
        {!registrationFeePaid && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5 min-w-0">
              <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700 min-w-0">
                <span className="font-bold text-slate-900">Activate your account.</span> Complete your profile, then pay a one-time <span className="line-through text-slate-400">₹499</span> <span className="font-semibold">₹99</span>.
              </p>
            </div>
            <Link href="/doctor/payment" className="btn-primary py-2 px-3.5 text-sm flex-shrink-0"><CreditCard className="w-4 h-4" /> Pay ₹99</Link>
          </div>
        )}
        {registrationFeePaid && !subActive && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700"><span className="font-bold text-slate-900">Your plan has expired.</span> Renew to keep seeing patients.</p>
            </div>
            <Link href="/doctor/subscribe" className="btn-primary py-2 px-3.5 text-sm flex-shrink-0"><CreditCard className="w-4 h-4" /> Renew ₹499</Link>
          </div>
        )}
        {registrationFeePaid && subActive && (() => {
          const isTrial = !!trialEndsAt && (!subscriptionPaidUntil || new Date(trialEndsAt) > new Date(subscriptionPaidUntil));
          const target = new Date(isTrial ? trialEndsAt! : subscriptionPaidUntil!);
          const left = daysUntil(target);
          const tone = left <= 2 ? "text-red-600" : left <= 7 ? "text-amber-600" : "text-emerald-600";
          return (
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-4 mb-5 flex items-center gap-2.5 text-sm">
              <CheckCircle2 className={cn("w-5 h-5 flex-shrink-0", tone)} />
              <span className="text-slate-700 flex-1">
                <span className="font-bold text-slate-900">{isTrial ? "Free trial active" : "Plan active"}</span> · {left === 0 ? "expires today" : `${left} day${left === 1 ? "" : "s"} left`}
              </span>
              <Link href="/doctor/subscribe" className="text-teal-600 font-semibold flex-shrink-0">Manage</Link>
            </div>
          );
        })()}

        <Group label="Your Profile">
          <Row href="/doctor/profile/professional" tint="bg-teal-50 text-teal-600" icon={<Award className="w-4 h-4" />}
            title="Professional Details" trailing={<Status done={professionalDone} />} />
          <Row href="/doctor/profile/consultation" tint="bg-emerald-50 text-emerald-600" icon={<IndianRupee className="w-4 h-4" />}
            title="Consultation & Fees" trailing={<Status done={consultationDone} />} />
          <Row href="/doctor/profile/availability" tint="bg-blue-50 text-blue-500" icon={<Clock className="w-4 h-4" />}
            title="Available Timings" />
          <Row href="/doctor/clinics" tint="bg-red-50 text-red-500" icon={<Building2 className="w-4 h-4" />}
            title="Clinics"
            trailing={<span className="text-xs font-semibold text-slate-400 flex-shrink-0">{clinicCount || "None"}</span>} />
        </Group>

        <Group label="Verification & Payouts">
          <Row href="/doctor/profile/documents" tint="bg-amber-50 text-amber-500" icon={<Shield className="w-4 h-4" />}
            title="Verification & Documents"
            trailing={p.isVerified
              ? <span className="text-xs font-semibold text-emerald-600 flex-shrink-0">Verified</span>
              : <Status done={docsDone} />} />
          <Row href="/doctor/profile/bank" tint="bg-purple-50 text-purple-500" icon={<CreditCard className="w-4 h-4" />}
            title="Bank Details" trailing={<Status done={done("Bank Details")} />} />
        </Group>

        <Group label="Grow">
          <Row href="/doctor/profile/qr" tint="bg-teal-50 text-teal-600" icon={<QrCode className="w-4 h-4" />}
            title="Booking QR Code" />
        </Group>

        <Group label="Account">
          <Row href="/doctor/profile/notifications" tint="bg-amber-50 text-amber-500" icon={<Bell className="w-4 h-4" />}
            title="Notifications" />
          <Row href="/doctor/support/tickets" tint="bg-indigo-50 text-indigo-500" icon={<LifeBuoy className="w-4 h-4" />}
            title="My Support Tickets" />
        </Group>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-slate-100 shadow-sm text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
