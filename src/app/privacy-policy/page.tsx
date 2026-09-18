import Link from "next/link";
import { FileCheck } from "lucide-react";
import LegalContent from "@/components/LegalContent";
import { TERMS_OF_SERVICE, PRIVACY_POLICY, LEGAL_LAST_UPDATED } from "@/lib/legalContent";

export const metadata = {
  title: "Privacy Policy & Terms of Service | DocOnClick",
  description: "DocOnClick's Privacy Policy and Terms of Service.",
};

// Publicly accessible (no login required) — required for Google Play Console
// app content review and for the Footer's Privacy Policy / Terms links.
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 safe-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline">← Back to DocOnClick</Link>

        <div className="mt-6 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Privacy Policy & Terms of Service</h1>
            <p className="text-sm text-slate-500">Last updated {LEGAL_LAST_UPDATED}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-10">
          <div id="privacy-policy">
            <LegalContent title="Privacy Policy" sections={PRIVACY_POLICY} />
          </div>
          <div id="terms-of-service" className="pt-8 border-t border-slate-100">
            <LegalContent title="Terms of Service" sections={TERMS_OF_SERVICE} />
          </div>
        </div>
      </div>
    </div>
  );
}
