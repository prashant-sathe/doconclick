"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import LegalContent from "@/components/LegalContent";
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from "@/lib/legalContent";
import { localizeLegal } from "@/lib/localizeLegal";
import { useTranslations } from "next-intl";

export default function DoctorTermsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("doctorAccount.terms");
  const l = useTranslations("legal");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/profile/terms");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  return (
    <DoctorProfileSubShell
      title={t("title")}
      description={t("lastUpdated", { date: l("lastUpdatedDate") })}
      icon={<FileCheck className="w-5 h-5" />}
      tint="bg-teal-50 text-teal-600"
      loading={authLoading || !user}
    >
      <div className="space-y-8">
        <LegalContent title={t("termsOfService")} sections={localizeLegal("tos", TERMS_OF_SERVICE, l)} />
        <LegalContent title={t("privacyPolicy")} sections={localizeLegal("privacy", PRIVACY_POLICY, l)} />
      </div>
    </DoctorProfileSubShell>
  );
}
