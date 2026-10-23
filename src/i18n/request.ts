import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { APP_LANGUAGE_COOKIE, DEFAULT_APP_LANGUAGE, isAppLanguage, uiLocale } from "@/lib/appLanguage";
import { loadMessages } from "@/i18n/messages";

// next-intl without locale routing: URLs stay the same (no /mr/… prefix — the
// native app's start URL, pay links and QR codes don't change). The locale is
// the `doconclick_lang` cookie, which mirrors User.language and is set by the
// profile language switch and at sign-in (src/lib/appLanguage.ts).
export default getRequestConfig(async () => {
  const saved = (await cookies()).get(APP_LANGUAGE_COOKIE)?.value;
  const locale = isAppLanguage(saved) ? saved : DEFAULT_APP_LANGUAGE;
  // Marathi runs as mr-IN-u-nu-latn (Latin digits) — see uiLocale().
  return { locale: uiLocale(locale), messages: await loadMessages(locale), timeZone: "Asia/Kolkata" };
});
