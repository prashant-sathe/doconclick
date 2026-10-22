// The language of the page for <html lang> (BUG-TRACKER #63) — what screen
// readers pick a voice by, and what browsers' translate offers start from.
// The UI is written in English (en-IN) today, so that's the default; a saved
// preference (cookie `doconclick_lang`) switches it, for pages that are
// translated. It's deliberately not taken from the device/browser language:
// English text read out with a Marathi voice is worse than the right label.
//
// Applied before first paint by HTML_LANG_SCRIPT in the root layout (no
// cookies() there, which would make every page dynamic), and live by
// setAppLanguage().

export const APP_LANGUAGES = ["en-IN", "hi-IN", "mr-IN"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
export const DEFAULT_APP_LANGUAGE: AppLanguage = "en-IN";
export const APP_LANGUAGE_COOKIE = "doconclick_lang";

export function isAppLanguage(v: unknown): v is AppLanguage {
  return typeof v === "string" && (APP_LANGUAGES as readonly string[]).includes(v);
}

/** Saves the preference and updates <html lang> right away. */
export function setAppLanguage(lang: AppLanguage) {
  document.cookie = `${APP_LANGUAGE_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.documentElement.lang = lang;
}

/** Inline <head> script: the saved language (if it's one we support) before the page paints. */
export const HTML_LANG_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${APP_LANGUAGE_COOKIE}=([^;]+)/);var l=m&&decodeURIComponent(m[1]);if(${JSON.stringify(APP_LANGUAGES)}.indexOf(l)>-1)document.documentElement.lang=l;}catch(e){}})();`;
