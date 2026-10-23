"use client";
import { useEffect, useState } from "react";
import { Camera, BadgeCheck, FileText, Shield } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import DocSlot from "@/components/doctor/DocSlot";
import { useDoctorProfile } from "@/lib/useDoctorProfile";
import { useTranslations } from "next-intl";

export default function VerificationDocumentsPage() {
  const t = useTranslations("doctorAccount.documents");
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
      title={t("title")}
      description={t("description")}
      icon={<Shield className="w-5 h-5" />}
      tint="bg-amber-50 text-amber-500"
      loading={loading}
    >
      {isVerified ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 flex-shrink-0" /> {t("verified")}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          {t.rich("mandatory", { star: () => <span className="text-red-500 font-bold">*</span> })}
        </div>
      )}

      <DocSlot label={t("photo")} icon={Camera} url={docs.photoUrl} type="photo" accept=".jpg,.jpeg,.png" cropAspect={1} removable onUploaded={upd("photoUrl")} />
      <DocSlot label={t("regCert")} icon={BadgeCheck} url={docs.medRegCertUrl} type="medRegCert" locked={isVerified} required removable onUploaded={upd("medRegCertUrl")} />
      <DocSlot label={t("degreeCert")} icon={FileText} url={docs.degreeCertUrl} type="degreeCert" locked={isVerified} required removable onUploaded={upd("degreeCertUrl")} />
      <DocSlot label={t("kyc")} icon={Shield} url={docs.kycDocUrl} type="kyc" locked={isVerified} required removable onUploaded={upd("kycDocUrl")} />
      <DocSlot
        label={t("signature")} icon={FileText} url={docs.signatureUrl} type="signature"
        accept=".jpg,.jpeg,.png" cropAspect={2.5} required
        requiredNote={t("signatureRequired")}
        removable onUploaded={upd("signatureUrl")}
      />
      <p className="text-xs text-slate-400">{t("signatureHint")}</p>
    </DoctorProfileSubShell>
  );
}
