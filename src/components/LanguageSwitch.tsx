"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages, Loader2 } from "lucide-react";
import { APP_LANGUAGES, APP_LANGUAGE_LABELS, type AppLanguage, setLanguageCookie } from "@/lib/appLanguage";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

// The language switch (src/lib/appLanguage.ts): saved on the account when
// signed in — so pushes use it too — and as the cookie the pages render in;
// router.refresh() re-renders the current screen in it straight away.
// `compact` is the sign-in page's version (no account yet; registration
// adopts the choice).
export default function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("common.language");
  const current = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<AppLanguage | null>(null);

  const choose = async (lang: AppLanguage) => {
    if (lang === current || busy) return;
    setBusy(lang);
    try {
      const res = await fetch("/api/auth/language", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang }),
      });
      if (!res.ok) throw new Error();
      setLanguageCookie(lang);
      router.refresh();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(null);
    }
  };

  const pills = (
    <div className={cn("grid grid-cols-3 gap-1.5", compact && "gap-1")} role="radiogroup" aria-label={t("title")}>
      {APP_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          role="radio"
          aria-checked={lang === current}
          lang={lang}
          onClick={() => choose(lang)}
          className={cn(
            "rounded-xl border font-semibold transition-colors inline-flex items-center justify-center gap-1",
            compact ? "px-2.5 py-1.5 text-xs" : "py-2.5 text-sm",
            lang === current ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          )}
        >
          {busy === lang && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {APP_LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );

  if (compact) return pills;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5">
      <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-1"><Languages className="w-4 h-4 text-blue-500" /> {t("title")}</p>
      <p className="text-xs text-slate-500 mb-3">{t("hint")}</p>
      {pills}
    </div>
  );
}
