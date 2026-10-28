import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Trash2, Mail, FileX2, CheckCircle2, Smartphone } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("public.dataDeletion");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { deleted } = await searchParams;
  const t = await getTranslations("public.dataDeletion");
  const l = await getTranslations("legal");

  const inAppSteps = [t("inAppStep1"), t("inAppStep2"), t("inAppStep3")];
  const emailSteps = [t("emailStep1"), t("emailStep2"), t("emailStep3")];
  const openBookings = [t("openBooking1"), t("openBooking2"), t("openBooking3")];
  const deletedItems = [t("deleted1"), t("deleted2"), t("deleted3"), t("deleted4"), t("deleted5")];
  const retainedItems = [t("retained1"), t("retained2"), t("retained3")];

  return (
    <div className="min-h-screen bg-slate-50 safe-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline tap-44-y">{t("back")}</Link>

        <div className="mt-6 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
            <p className="text-sm text-slate-500">{t("lastUpdated", { date: l("lastUpdatedDate") })}</p>
          </div>
        </div>

        {deleted === "1" && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            <p>{t("deletedBanner")}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Smartphone className="w-4.5 h-4.5 text-slate-400" />
              <h2 className="text-lg font-extrabold text-slate-900">{t("inAppTitle")}</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              {t("inAppDesc")}
            </p>
            <ol className="space-y-3 mb-5">
              {inAppSteps.map((step, i) => (
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
              <Trash2 className="w-4 h-4" /> {t("deleteBtn")}
            </Link>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">{t("emailTitle")}</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              {t("emailDesc")}
            </p>
            <ol className="space-y-3 mb-5">
              {emailSteps.map((step, i) => (
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
              <Mail className="w-4 h-4" /> {t("emailBtn")}
            </a>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <FileX2 className="w-4.5 h-4.5 text-slate-400" />
              <h2 className="text-lg font-extrabold text-slate-900">{t("singleDocTitle")}</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t("singleDocDesc")}
            </p>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">{t("openBookingsTitle")}</h2>
            <ul className="space-y-2 list-disc list-inside">
              {openBookings.map((item, i) => (
                <li key={i} className="text-sm text-slate-600 leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">{t("deletedTitle")}</h2>
            <ul className="space-y-2 list-disc list-inside">
              {deletedItems.map((item, i) => (
                <li key={i} className="text-sm text-slate-600 leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">{t("retainedTitle")}</h2>
            <ul className="space-y-2 list-disc list-inside">
              {retainedItems.map((item, i) => (
                <li key={i} className="text-sm text-slate-600 leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
