"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import LegalContent from "@/components/LegalContent";
import { TERMS_OF_SERVICE, PRIVACY_POLICY, LEGAL_LAST_UPDATED } from "@/lib/legalContent";
import { useTranslations } from "next-intl";

export default function DoctorTermsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("doctorAccount.terms");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/profile/terms");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  return (
    <DoctorProfileSubShell
      title={t("title")}
      description={t("lastUpdated", { date: LEGAL_LAST_UPDATED })}
      icon={<FileCheck className="w-5 h-5" />}
      tint="bg-teal-50 text-teal-600"
      loading={authLoading || !user}
    >
      <div className="space-y-8">
        <LegalContent title="Terms of Service" sections={TERMS_OF_SERVICE} />
        <LegalContent title="Privacy Policy" sections={PRIVACY_POLICY} />
      </div>
    </DoctorProfileSubShell>
  );
}
