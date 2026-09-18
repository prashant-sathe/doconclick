import Link from "next/link";
import { Trash2, Mail, FileX2 } from "lucide-react";
import { LEGAL_LAST_UPDATED } from "@/lib/legalContent";

export const metadata = {
  title: "Delete Your Data | DocOnClick",
  description: "How to request deletion of your DocOnClick account and personal data.",
};

const STEPS = [
  "Email support@doconclick.com from the email address or mobile number registered on your account, with the subject \"Data Deletion Request\".",
  "Include your full name and registered mobile number/email so we can verify you're the account owner.",
  "We verify the request and process it within 30 days, and confirm back to you by email once it's done.",
];

const DELETED = [
  "Your name, email address, and mobile number (permanently anonymized so they can no longer identify you, and freed up for a new registration).",
  "Login access to your account.",
  "Saved home address, search radius, emergency contact, and other profile details.",
  "Uploaded medical documents/photos not already attached to a completed appointment record (see retained data below).",
];

const RETAINED = [
  "Completed appointment history, chat messages exchanged during a consultation, and payment/settlement records — kept because they're also part of the treating doctor's medical record and our payout audit trail, and because Indian accounting law requires financial records to be retained for several years (typically up to 8 years under the Companies Act, 2013).",
  "Any data we're legally required to keep for an ongoing dispute, complaint investigation, or regulatory request.",
];

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-slate-50 safe-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline">← Back to DocOnClick</Link>

        <div className="mt-6 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Delete Your Data</h1>
            <p className="text-sm text-slate-500">Last updated {LEGAL_LAST_UPDATED}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-10">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">How to request deletion</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              You can request that DocOnClick delete your account and personal data at any time, without needing to
              delete anything from within the app first.
            </p>
            <ol className="space-y-3 mb-5">
              {STEPS.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <a
              href="mailto:support@doconclick.com?subject=Data%20Deletion%20Request"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white text-sm font-semibold px-5 py-3 hover:bg-blue-700 transition-colors"
            >
              <Mail className="w-4 h-4" /> Email support@doconclick.com
            </a>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <FileX2 className="w-4.5 h-4.5 text-slate-400" />
              <h2 className="text-lg font-extrabold text-slate-900">Prefer to delete just one document?</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              If you only want to remove a specific uploaded health record — without deleting your whole account —
              you can do that yourself anytime from <span className="font-semibold">Profile → Health Documents</span> in
              the app.
            </p>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">What gets deleted</h2>
            <ul className="space-y-2 list-disc list-inside">
              {DELETED.map((item, i) => (
                <li key={i} className="text-sm text-slate-600 leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">What we keep, and why</h2>
            <ul className="space-y-2 list-disc list-inside">
              {RETAINED.map((item, i) => (
                <li key={i} className="text-sm text-slate-600 leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
