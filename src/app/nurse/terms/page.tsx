"use client";
import { FileCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import NurseSubShell from "@/components/nurse/NurseSubShell";
import LegalContent from "@/components/LegalContent";
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from "@/lib/legalContent";
import { localizeLegal } from "@/lib/localizeLegal";

export default function NurseTermsPage() {
  const t = useTranslations("nurse.terms");
  const l = useTranslations("legal");
  return (
    <NurseSubShell title={t("title")} description={t("lastUpdated", { date: l("lastUpdatedDate") })} icon={<FileCheck className="w-5 h-5" />}>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-8">
        <LegalContent title={t("termsOfService")} sections={localizeLegal("tos", TERMS_OF_SERVICE, l)} />
        <LegalContent title={t("privacyPolicy")} sections={localizeLegal("privacy", PRIVACY_POLICY, l)} />
      </div>
    </NurseSubShell>
  );
}
