// The app's language — UI and push texts (next-intl, src/i18n). One of
// en-IN / hi-IN / mr-IN / kn-IN (Marathi and Hindi in Devanagari, Kannada in
// Kannada script). Stored on
// User.language (pushes read it there) and mirrored to the `doconclick_lang`
// cookie, which the server renders each page in (src/i18n/request.ts). It's
// deliberately not taken from the device/browser language — a new user
// starts in English and picks theirs in Profile (or on the sign-in page).

export const APP_LANGUAGES = ["en-IN", "hi-IN", "mr-IN", "kn-IN"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
export const DEFAULT_APP_LANGUAGE: AppLanguage = "en-IN";
export const APP_LANGUAGE_COOKIE = "doconclick_lang";

/** Each language in its own script — how a user recognises theirs. */
export const APP_LANGUAGE_LABELS: Record<AppLanguage, string> = {
  "en-IN": "English",
  "hi-IN": "हिन्दी",
  "mr-IN": "मराठी",
  "kn-IN": "ಕನ್ನಡ",
};

/** Each language's English name — for prompts to AI models (e.g. voice). */
export const APP_LANGUAGE_LABELS_EN: Record<AppLanguage, string> = {
  "en-IN": "Indian English",
  "hi-IN": "Hindi",
  "mr-IN": "Marathi",
  "kn-IN": "Kannada",
};

export function isAppLanguage(v: unknown): v is AppLanguage {
  return typeof v === "string" && (APP_LANGUAGES as readonly string[]).includes(v);
}

/** The cookie's value in a document.cookie / Cookie header string. */
export function languageFromCookieHeader(cookieHeader: string | null | undefined): AppLanguage | null {
  const m = (cookieHeader ?? "").match(new RegExp(`(?:^|; )${APP_LANGUAGE_COOKIE}=([^;]+)`));
  const v = m ? decodeURIComponent(m[1]) : null;
  return isAppLanguage(v) ? v : null;
}

/** Client: saves the cookie and updates <html lang>; re-render with router.refresh(). */
export function setLanguageCookie(lang: AppLanguage) {
  document.cookie = `${APP_LANGUAGE_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.documentElement.lang = lang;
}

/**
 * The locale to format dates/numbers with. Marathi's default numbering is
 * Devanagari digits (३:०० PM) — but amounts, mobiles and slot times are in
 * Latin digits everywhere else in the app, as in most Marathi consumer apps,
 * so Marathi formats with Latin digits too. Hindi's and Kannada's defaults
 * already are.
 */
export function formattingLocale(lang: string): string {
  return lang === "mr-IN" ? "mr-IN-u-nu-latn" : lang;
}

/**
 * The locale next-intl runs in: the user's language, except that Marathi
 * carries the Latin-digits extension (formattingLocale) so ICU plurals (#),
 * {n, number} and {d, date} in messages print 12, not १२ — matching amounts
 * and slot times. useLocale() returns this; compare with baseLanguage().
 */
export type UiLocale = AppLanguage | "mr-IN-u-nu-latn";

export function uiLocale(lang: AppLanguage): UiLocale {
  return formattingLocale(lang) as UiLocale;
}

/** The plain language of a UI locale (drops any -u-… extension). */
export function baseLanguage(locale: string): AppLanguage {
  const base = locale.split("-u-")[0];
  return isAppLanguage(base) ? base : DEFAULT_APP_LANGUAGE;
}
