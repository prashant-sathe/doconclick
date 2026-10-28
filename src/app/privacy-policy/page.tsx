import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FileCheck } from "lucide-react";
import LegalContent from "@/components/LegalContent";
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from "@/lib/legalContent";
import { localizeLegal } from "@/lib/localizeLegal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("public.privacyPage");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

// Publicly accessible (no login required) — required for Google Play Console
// app content review and for the Footer's Privacy Policy / Terms links.
// The English text in src/lib/legalContent.ts is the source of truth for the
// section/paragraph structure; the words come from messages/<locale>/legal.json
// (tests/i18n.ts checks that en-IN matches legalContent.ts).
export default async function PrivacyPolicyPage() {
  const t = await getTranslations("public.privacyPage");
  const l = await getTranslations("legal");

  return (
    <div className="min-h-screen bg-slate-50 safe-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline tap-44-y">{t("back")}</Link>

        <div className="mt-6 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
            <p className="text-sm text-slate-500">{t("lastUpdated", { date: l("lastUpdatedDate") })}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-10">
          <div id="privacy-policy">
            <LegalContent title={t("privacyTitle")} sections={localizeLegal("privacy", PRIVACY_POLICY, l)} />
          </div>
          <div id="terms-of-service" className="pt-8 border-t border-slate-100">
            <LegalContent title={t("termsTitle")} sections={localizeLegal("tos", TERMS_OF_SERVICE, l)} />
          </div>
        </div>
      </div>
    </div>
  );
}
