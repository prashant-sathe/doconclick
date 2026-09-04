"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, MapPin, HeartPulse, PhoneCall, Compass, Bell, Wallet as WalletIcon,
  LifeBuoy, ChevronRight, Check, Camera, LogOut, User, Trash2, Lock,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import { computeCompleteness } from "@/lib/profileCompleteness";
import { usePatientProfile } from "@/lib/usePatientProfile";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import ImageCropModal from "@/components/ImageCropModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EditableName from "@/components/EditableName";

function AvatarEditor({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const upload = async (blob: Blob) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", blob, "photo.jpg");
    const res = await fetch("/api/patients/me/photo", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) onChange((await res.json()).photoUrl);
  };

  const remove = async () => {
    setBusy(true);
    const res = await fetch("/api/patients/me/photo", { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChange("");
  };

  const onAvatarClick = () => {
    if (url) setMenuOpen((v) => !v);
    else inputRef.current?.click();
  };

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={onAvatarClick}
        className="relative w-16 h-16 rounded-full block overflow-hidden bg-slate-100 border border-slate-200"
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
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }}
      />
      {menuOpen && (
        <div className="absolute left-0 top-full mt-2 z-20 w-44 rounded-xl bg-white border border-slate-100 shadow-lg py-1 overflow-hidden">
          <button
            type="button"
            onClick={() => { setMenuOpen(false); inputRef.current?.click(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 text-left"
          >
            <Camera className="w-4 h-4 text-slate-400" /> Change photo
          </button>
          <button
            type="button"
            onClick={() => { setMenuOpen(false); setConfirmRemove(true); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 text-left"
          >
            <Trash2 className="w-4 h-4" /> Remove photo
          </button>
        </div>
      )}
      {pendingFile && (
        <ImageCropModal
          file={pendingFile}
          aspect={1}
          round
          onCancel={() => setPendingFile(null)}
          onConfirm={(blob) => { setPendingFile(null); upload(blob); }}
        />
      )}
      {confirmRemove && (
        <ConfirmDialog
          icon={Trash2}
          title="Remove profile photo?"
          message="You can upload a new one anytime."
          confirmLabel="Remove"
          busyLabel="Removing…"
          tone="danger"
          busy={busy}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={async () => { await remove(); setConfirmRemove(false); }}
        />
      )}
    </div>
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

function StatusPill({ done, total }: { done: number; total: number }) {
  if (done >= total) return <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
  return <span className="text-xs font-semibold text-amber-600 flex-shrink-0">{done}/{total}</span>;
}

export default function PatientProfilePage() {
  const { user, loading: authLoading, logout, refresh } = useAuth();
  const router = useRouter();
  const { profile, loading, setProfile } = usePatientProfile();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/patient/profile");
    if (!authLoading && user && user.role !== "PATIENT") router.push("/login");
  }, [authLoading, user, router]);

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>;
  }

  const p = profile ?? {};
  const completeness = computeCompleteness({
    location: p.location ?? null,
    homeAddress: p.homeAddress ?? null,
    pinCode: p.pinCode ?? null,
    bloodGroup: p.bloodGroup ?? null,
    height: p.height ?? null,
    weight: p.weight ?? null,
    allergies: p.allergies ?? null,
    chronicDiseases: p.chronicDiseases ?? null,
    emergencyContactName: p.emergencyContactName ?? null,
    emergencyContactPhone: p.emergencyContactPhone ?? null,
    photoUrl: p.photoUrl ?? null,
  });
  const done = (label: string) => completeness.items.find((i) => i.label === label)?.done ?? false;

  const medicalDone = ["Blood Group", "Height & Weight", "Allergies", "Chronic Conditions"].filter(done).length;
  const addressDone = ["Location", "Home Address"].filter(done).length;
  const emergencyDone = done("Emergency Contact");

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />

      <div className="max-w-xl mx-auto py-6 px-4 sm:px-6">
        {/* Profile header */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6 flex items-center gap-4">
          <AvatarEditor url={p.photoUrl ?? ""} onChange={(url) => setProfile((prev) => ({ ...(prev ?? {}), photoUrl: url }))} />
          <div className="min-w-0 flex-1">
            <EditableName name={user.name} onSaved={refresh} />
            <p className="text-sm text-slate-500">{user.mobile}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", completeness.percent === 100 ? "bg-emerald-500" : "bg-blue-500")}
                  style={{ width: `${completeness.percent}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-500 flex-shrink-0">
                {completeness.percent === 100 ? "Complete" : `${completeness.percent}%`}
              </span>
            </div>
          </div>
        </div>

        <Group label="Your Information">
          <Row href="/patient/profile/personal" tint="bg-red-50 text-red-500" icon={<HeartPulse className="w-4 h-4" />}
            title="Personal & Medical Info" trailing={<StatusPill done={medicalDone} total={4} />} />
          <Row href="/patient/profile/address" tint="bg-blue-50 text-blue-500" icon={<MapPin className="w-4 h-4" />}
            title="Location & Address" trailing={<StatusPill done={addressDone} total={2} />} />
          <Row href="/patient/profile/emergency" tint="bg-emerald-50 text-emerald-600" icon={<PhoneCall className="w-4 h-4" />}
            title="Emergency Contact" trailing={<StatusPill done={emergencyDone ? 1 : 0} total={1} />} />
        </Group>

        <Group label="Preferences">
          <Row href="/patient/profile/search-range" tint="bg-blue-50 text-blue-500" icon={<Compass className="w-4 h-4" />}
            title="Doctor Search Range"
            trailing={<span className="text-xs font-semibold text-slate-400 flex-shrink-0">{p.searchRadiusKm != null ? `${p.searchRadiusKm} km` : "Any distance"}</span>} />
          <Row href="/patient/profile/notifications" tint="bg-amber-50 text-amber-500" icon={<Bell className="w-4 h-4" />}
            title="Notifications" />
        </Group>

        <Group label="Account">
          <Row href="/patient/wallet" tint="bg-emerald-50 text-emerald-600" icon={<WalletIcon className="w-4 h-4" />}
            title="Wallet" />
          <Row href="/patient/profile/security" tint="bg-indigo-50 text-indigo-500" icon={<Lock className="w-4 h-4" />}
            title="Change Password" />
          <Row href="/patient/support" tint="bg-indigo-50 text-indigo-500" icon={<LifeBuoy className="w-4 h-4" />}
            title="Help & Support" />
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
