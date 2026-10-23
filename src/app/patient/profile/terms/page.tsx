"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import LegalContent from "@/components/LegalContent";
import { TERMS_OF_SERVICE, PRIVACY_POLICY, LEGAL_LAST_UPDATED } from "@/lib/legalContent";
import { useTranslations } from "next-intl";

export default function PatientTermsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("patientAccount.terms");
  // The legal text itself stays English (src/lib/legalContent.ts); only the chrome is translated.
  const updated = new Date(LEGAL_LAST_UPDATED);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/patient/profile/terms");
    if (!authLoading && user && user.role !== "PATIENT") router.push("/login");
  }, [authLoading, user, router]);

  return (
    <ProfileSubShell
      title={t("title")}
      description={Number.isNaN(updated.getTime()) ? LEGAL_LAST_UPDATED : t("lastUpdated", { date: updated })}
      icon={<FileCheck className="w-5 h-5" />}
      tint="bg-blue-50 text-blue-600"
      loading={authLoading || !user}
    >
      <div className="space-y-8">
        <LegalContent title={t("tos")} sections={TERMS_OF_SERVICE} />
        <LegalContent title={t("privacy")} sections={PRIVACY_POLICY} />
      </div>
    </ProfileSubShell>
  );
}
