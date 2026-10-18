import Link from "next/link";
import { Trash2, Mail, FileX2, CheckCircle2, Smartphone } from "lucide-react";
import { LEGAL_LAST_UPDATED } from "@/lib/legalContent";

export const metadata = {
  title: "Delete Your Data | DocOnClick",
  description: "How to request deletion of your DocOnClick account and personal data.",
};

const IN_APP_STEPS = [
  "Sign in to the DocOnClick app or website.",
  "Go to Profile → Password & Security and tap \"Delete my account\".",
  "Review what happens to your open bookings, enter your password, and type DELETE to confirm. Your account is deleted immediately.",
];

const EMAIL_STEPS = [
  "Email support@doconclick.com from the email address or mobile number registered on your account, with the subject \"Data Deletion Request\".",
  "Include your full name and registered mobile number/email so we can verify you're the account owner.",
  "We verify the request and process it within 30 days, and confirm back to you by email once it's done.",
];

const DELETED = [
  "Your name, email address, and mobile number (permanently anonymized so they can no longer identify you, and freed up for a new registration).",
  "Login access to your account, on every device.",
  "Saved home address, search radius, emergency contact, medical details, self-recorded vitals, and other profile details.",
  "Uploaded medical documents/photos not already attached to a completed appointment record (see retained data below).",
  "For doctors and nurses: profile photo, bio, address, location, and uploaded KYC/certificate documents. Your listing is removed from search.",
];

const OPEN_BOOKINGS = [
  "Any upcoming or pending bookings are cancelled, and the other party is notified.",
  "Bookings already paid online are refunded to the patient's DocOnClick wallet. Patients deleting their own account: wallet money can't be used once the account is gone, so email support@doconclick.com first if you want your balance paid back.",
  "If a visit is in progress (the doctor has arrived, or a nurse has started the visit), finish it first. Deletion is blocked until then.",
];

const RETAINED = [
  "For doctors and nurses: your name, qualification, registration number, and signature, because they appear on prescriptions and visit records your patients still rely on. Bank details are kept until any unsettled earnings are paid out.",
  "Completed appointment history, chat messages exchanged during a consultation, and payment/settlement records — kept because they're also part of the treating doctor's medical record and our payout audit trail, and because Indian accounting law requires financial records to be retained for several years (typically up to 8 years under the Companies Act, 2013).",
  "Any data we're legally required to keep for an ongoing dispute, complaint investigation, or regulatory request.",
];

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { deleted } = await searchParams;
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

        {deleted === "1" && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            <p>Your account has been deleted and you&apos;ve been signed out everywhere. Details of what we removed and kept are below.</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Smartphone className="w-4.5 h-4.5 text-slate-400" />
              <h2 className="text-lg font-extrabold text-slate-900">Delete your account in the app</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              Patients, doctors, and nurses can delete their own account at any time:
            </p>
            <ol className="space-y-3 mb-5">
              {IN_APP_STEPS.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 text-red-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <Link
              href="/account/delete"
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 text-white text-sm font-semibold px-5 py-3 hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete my account
            </Link>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">Or request deletion by email</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              Can&apos;t sign in? You can also ask DocOnClick to delete your account and personal data by email.
            </p>
            <ol className="space-y-3 mb-5">
              {EMAIL_STEPS.map((step, i) => (
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
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">What happens to open bookings</h2>
            <ul className="space-y-2 list-disc list-inside">
              {OPEN_BOOKINGS.map((item, i) => (
                <li key={i} className="text-sm text-slate-600 leading-relaxed">{item}</li>
              ))}
            </ul>
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
