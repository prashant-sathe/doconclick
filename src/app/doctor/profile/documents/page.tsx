"use client";
import { useEffect, useState } from "react";
import { Camera, BadgeCheck, FileText, Shield } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import DocSlot from "@/components/doctor/DocSlot";
import { useDoctorProfile } from "@/lib/useDoctorProfile";

export default function VerificationDocumentsPage() {
  const { profile, loading } = useDoctorProfile();

  const [docs, setDocs] = useState({
    photoUrl: null as string | null,
    medRegCertUrl: null as string | null,
    degreeCertUrl: null as string | null,
    kycDocUrl: null as string | null,
    signatureUrl: null as string | null,
  });
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDocs({
      photoUrl: profile.photoUrl ?? null,
      medRegCertUrl: profile.medRegCertUrl ?? null,
      degreeCertUrl: profile.degreeCertUrl ?? null,
      kycDocUrl: profile.kycDocUrl ?? null,
      signatureUrl: profile.signatureUrl ?? null,
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsVerified(!!profile.isVerified);
  }, [profile]);

  const upd = (k: keyof typeof docs) => (url: string) => setDocs((d) => ({ ...d, [k]: url || null }));

  return (
    <DoctorProfileSubShell
      title="Verification & Documents"
      description="Uploads save immediately. Your profile only shows to patients once our team verifies you."
      icon={<Shield className="w-5 h-5" />}
      tint="bg-amber-50 text-amber-500"
      loading={loading}
    >
      {isVerified ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 flex-shrink-0" /> Your credentials are verified. Documents are locked.
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          The items marked <span className="text-red-500 font-bold">*</span> are mandatory to get verified.
        </div>
      )}

      <DocSlot label="Profile Photo" icon={Camera} url={docs.photoUrl} type="photo" accept=".jpg,.jpeg,.png" cropAspect={1} removable onUploaded={upd("photoUrl")} />
      <DocSlot label="Registration Certificate" icon={BadgeCheck} url={docs.medRegCertUrl} type="medRegCert" locked={isVerified} required removable onUploaded={upd("medRegCertUrl")} />
      <DocSlot label="Medical Degree Certificate" icon={FileText} url={docs.degreeCertUrl} type="degreeCert" locked={isVerified} required removable onUploaded={upd("degreeCertUrl")} />
      <DocSlot label="Government ID (KYC)" icon={Shield} url={docs.kycDocUrl} type="kyc" locked={isVerified} required removable onUploaded={upd("kycDocUrl")} />
      <DocSlot
        label="Prescription Signature" icon={FileText} url={docs.signatureUrl} type="signature"
        accept=".jpg,.jpeg,.png" cropAspect={2.5} required
        requiredNote="Required for your account to be approved — not uploaded yet"
        removable onUploaded={upd("signatureUrl")}
      />
      <p className="text-xs text-slate-400">Your signature is printed on every prescription you generate.</p>
    </DoctorProfileSubShell>
  );
}
