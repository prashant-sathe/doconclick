"use client";
import { FileCheck } from "lucide-react";
import NurseSubShell from "@/components/nurse/NurseSubShell";
import LegalContent from "@/components/LegalContent";
import { TERMS_OF_SERVICE, PRIVACY_POLICY, LEGAL_LAST_UPDATED } from "@/lib/legalContent";

export default function NurseTermsPage() {
  return (
    <NurseSubShell title="Terms & Privacy Policy" description={`Last updated ${LEGAL_LAST_UPDATED}`} icon={<FileCheck className="w-5 h-5" />}>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-8">
        <LegalContent title="Terms of Service" sections={TERMS_OF_SERVICE} />
        <LegalContent title="Privacy Policy" sections={PRIVACY_POLICY} />
      </div>
    </NurseSubShell>
  );
}
