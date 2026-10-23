"use client";
import { FileCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import NurseSubShell from "@/components/nurse/NurseSubShell";
import LegalContent from "@/components/LegalContent";
import { TERMS_OF_SERVICE, PRIVACY_POLICY, LEGAL_LAST_UPDATED } from "@/lib/legalContent";

// Chrome only — the legal text itself stays in English.
export default function NurseTermsPage() {
  const t = useTranslations("nurse.terms");
  return (
    <NurseSubShell title={t("title")} description={t("lastUpdated", { date: LEGAL_LAST_UPDATED })} icon={<FileCheck className="w-5 h-5" />}>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-8">
        <LegalContent title={t("termsOfService")} sections={TERMS_OF_SERVICE} />
        <LegalContent title={t("privacyPolicy")} sections={PRIVACY_POLICY} />
      </div>
    </NurseSubShell>
  );
}
