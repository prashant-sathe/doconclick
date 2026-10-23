import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createTranslator } from "use-intl/core";
import enCatalog from "../../messages/en-IN/errors.json";
import { errorPattern } from "@/lib/errorCatalog";
import { APP_LANGUAGE_COOKIE, DEFAULT_APP_LANGUAGE, formattingLocale, isAppLanguage, type AppLanguage } from "@/lib/appLanguage";

// Server error messages in the user's language. Routes keep writing
// `{ error: "English sentence" }`; withErrorLocale() wraps a route handler
// and, for a 4xx/5xx JSON response, looks the English up in
// messages/en-IN/errors.json (an entry may have `{name}` where the message
// varies) and swaps in that entry from messages/<locale>/errors.json.
// Anything not in the catalog, or not yet translated, stays English.
// scripts/i18n-errors.ts finds messages missing from the catalog.

type Catalog = Record<string, string>;
type Values = Record<string, string | number>;

const literal = (english: string) => english.replace(/\{[A-Za-z]\w*\}/g, "");

const entries = Object.entries(enCatalog as Catalog).filter(([, english]) => /[A-Za-z][\s\S]*[A-Za-z][\s\S]*[A-Za-z]/.test(literal(english)));
const exact = new Map(entries.filter(([, english]) => english === literal(english)).map(([id, english]) => [english, id]));
// Most specific first, so "The doctor is already on the way…" wins over "The {provider} is…".
const patterned = entries
  .filter(([, english]) => english !== literal(english))
  .sort((a, b) => literal(b[1]).length - literal(a[1]).length)
  .map(([id, english]) => ({ id, re: errorPattern(english) }));

/** The catalog entry an English message is, with the parts that varied. */
export function matchError(text: string): { id: string; values: Record<string, string> } | null {
  const id = exact.get(text);
  if (id) return { id, values: {} };
  for (const p of patterned) {
    const m = p.re.exec(text);
    if (m) return { id: p.id, values: { ...m.groups } };
  }
  return null;
}

const catalogs = new Map<AppLanguage, Promise<Catalog>>();

function catalogFor(lang: Exclude<AppLanguage, "en-IN">): Promise<Catalog> {
  let hit = process.env.NODE_ENV === "production" ? catalogs.get(lang) : undefined;
  if (!hit) {
    hit = import(`../../messages/${lang}/errors.json`).then((m) => m.default as Catalog, () => ({}));
    catalogs.set(lang, hit);
  }
  return hit;
}

/** `text` in `lang` — or `text` itself when it isn't in the catalog or isn't translated yet. */
export async function translateError(text: string, lang: AppLanguage, depth = 0): Promise<string> {
  if (lang === "en-IN" || !text) return text;
  const hit = matchError(text);
  if (!hit) {
    if (process.env.NODE_ENV !== "production" && depth === 0) console.warn(`[i18n] error not in messages/en-IN/errors.json: ${JSON.stringify(text)}`);
    return text;
  }
  const messages = await catalogFor(lang);
  if (!messages[hit.id]?.trim()) return text;
  const values: Values = {};
  for (const [name, v] of Object.entries(hit.values)) {
    // A small count can drive a plural; a longer number (amount, mobile) stays as written.
    if (/^\d{1,4}$/.test(v)) values[name] = Number(v);
    // A whole English sentence spliced in ("{reason} Pick another time.") is translated too.
    else if (depth < 2 && /[A-Za-z]{3}.*\s/.test(v)) values[name] = await translateError(v, lang, depth + 1);
    else values[name] = v;
  }
  const t = createTranslator({
    locale: formattingLocale(lang) as AppLanguage,
    messages: { errors: messages },
    namespace: "errors",
    timeZone: "Asia/Kolkata",
    onError: () => {},
    getMessageFallback: () => text,
  }) as unknown as (key: string, values?: Values) => string;
  return t(hit.id, values);
}

/** The signed-in user's app language (the `doconclick_lang` cookie). */
export async function requestLanguage(): Promise<AppLanguage> {
  try {
    const v = (await cookies()).get(APP_LANGUAGE_COOKIE)?.value;
    return isAppLanguage(v) ? v : DEFAULT_APP_LANGUAGE;
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}

/** A failed JSON response with its `error` (and `message`) in the user's language. */
export async function localizeErrorResponse(res: Response): Promise<Response> {
  if (res.status < 400 || !res.headers.get("content-type")?.includes("application/json")) return res;
  const lang = await requestLanguage();
  if (lang === DEFAULT_APP_LANGUAGE) return res;
  let body: unknown;
  try {
    body = await res.clone().json();
  } catch {
    return res;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return res;
  const out = { ...(body as Record<string, unknown>) };
  let changed = false;
  for (const field of ["error", "message"] as const) {
    const v = out[field];
    if (typeof v !== "string") continue;
    const tr = await translateError(v, lang);
    if (tr !== v) { out[field] = tr; changed = true; }
  }
  if (!changed) return res;
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return NextResponse.json(out, { status: res.status, statusText: res.statusText, headers });
}

/**
 * Wraps a route handler so its error responses are in the user's language:
 * `export const POST = withErrorLocale(async function POST(req) { … })`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorLocale<F extends (...args: any[]) => Promise<Response> | Response>(handler: F): F {
  return (async (...args: Parameters<F>) => localizeErrorResponse(await handler(...args))) as F;
}
