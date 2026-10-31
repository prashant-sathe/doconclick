// Server error messages in the user's language (src/lib/apiErrors.ts):
// every user-facing message in the code has an entry in
// messages/en-IN/errors.json; hi-IN, mr-IN and kn-IN translate every entry,
// in Devanagari (hi/mr) or Kannada script (kn), with the same {placeholders}; each entry's English matches back
// to itself (no entry shadows another); and live API errors come back in the
// language of the `doconclick_lang` cookie, with their status and other
// fields unchanged. Pure checks, then against a live dev server.
//
//   npm run test:i18n-errors        (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import fs from "fs";
import path from "path";
import { extractMessages } from "../scripts/i18n-errors";
import { errorPattern } from "../src/lib/errorCatalog";
import { matchError, translateError } from "../src/lib/apiErrors";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type Catalog = Record<string, string>;
const read = (locale: string): Catalog => JSON.parse(fs.readFileSync(path.join("messages", locale, "errors.json"), "utf8"));
const ignored: string[] = fs.existsSync("scripts/i18n-errors-ignore.json") ? JSON.parse(fs.readFileSync("scripts/i18n-errors-ignore.json", "utf8")) : [];

/** Placeholders holding an English "s" suffix, which translations drop. */
const SUFFIXES = new Set(["plural", "verbS"]);
/** The {argument} names an ICU message uses (not plural/select option bodies). */
const args = (msg: string) => new Set([...msg.matchAll(/\{\s*([A-Za-z]\w*)\s*[,}]/g)].map((m) => m[1]));
/** An English entry with sample values in its placeholders. */
const sample = (english: string) => english.replace(/\{([A-Za-z]\w*)\}/g, (_, name: string) => (/count|left|days|hours|min|wait|visits|max|limit|n$/i.test(name) ? "3" : `X${name}X`));

async function main() {
  const en = read("en-IN");

  // ── Coverage: every message in the code is in the catalog ──
  const patterns = Object.values(en).map(errorPattern);
  const missing = [...new Set(extractMessages().map((m) => m.text))]
    .filter((t) => !ignored.includes(t))
    .filter((t) => !patterns.some((re) => re.test(t) || re.test(t.replace(/\{[^}]+\}/g, "7"))));
  check("every user-facing server message is in errors.json", missing.length === 0, missing.slice(0, 4).join(" | ") || `${Object.keys(en).length} entries`);

  // ── Entries match back to themselves ──
  const shadowed = Object.entries(en).filter(([id, english]) => matchError(sample(english))?.id !== id);
  check("each entry's English matches that entry (nothing shadows it)", shadowed.length === 0, shadowed.slice(0, 4).map(([id]) => `${id} → ${matchError(sample(en[id]))?.id}`).join(", ") || "ok");

  // ── Translations ──
  for (const locale of ["hi-IN", "mr-IN", "kn-IN"] as const) {
    const script = locale === "kn-IN" ? { name: "Kannada script", re: /[ಀ-೿]/ } : { name: "Devanagari", re: /[ऀ-ॿ]/ };
    const tr = read(locale);
    const absent = Object.keys(en).filter((id) => !tr[id]?.trim());
    const extra = Object.keys(tr).filter((id) => !(id in en));
    check(`${locale}: translates every entry, no extras`, absent.length === 0 && extra.length === 0, absent.length || extra.length ? `missing ${absent.slice(0, 5).join(", ")} extra ${extra.slice(0, 5).join(", ")}` : `${Object.keys(tr).length} entries`);
    // A translation uses the English placeholders — except English-only
    // suffixes ({plural}/{verbS} = "" or "s"), which a translation may drop.
    const argDiff = Object.keys(en).filter((id) => {
      if (!tr[id]) return false;
      const want = [...args(en[id])].filter((a) => !SUFFIXES.has(a));
      const got = [...args(tr[id])].filter((a) => !SUFFIXES.has(a));
      return want.sort().join() !== got.sort().join() || [...args(tr[id])].some((a) => !args(en[id]).has(a));
    });
    check(`${locale}: same {placeholders} as English`, argDiff.length === 0, argDiff.slice(0, 4).map((id) => `${id}: ${[...args(en[id])]} vs ${[...args(tr[id])]}`).join(" | ") || "ok");
    const latin = Object.entries(tr).filter(([, v]) => !script.re.test(v.replace(/\{[^}]*\}/g, "")));
    check(`${locale}: in ${script.name}`, latin.length === 0, latin.slice(0, 4).map(([id, v]) => `${id}="${v}"`).join(" | ") || "ok");
    if (locale === "mr-IN") {
      const broken = Object.keys(tr).filter((id) => /अॅ/.test(tr[id]));
      check("mr-IN: uses ॲ, not अॅ", broken.length === 0, broken.slice(0, 4).join(", ") || "ok");
    }
    const bad: string[] = [];
    for (const [id, english] of Object.entries(en)) {
      const out = await translateError(sample(english), locale);
      if (out === sample(english)) bad.push(`${id}: untranslated`);
      else if (/[{}]/.test(out)) bad.push(`${id}: left a placeholder → ${out}`);
      else if (/[०-९೦-೯]/.test(out)) bad.push(`${id}: non-Latin digits → ${out}`);
      else for (const v of english.matchAll(/\{([A-Za-z]\w*)\}/g)) {
        if (SUFFIXES.has(v[1])) continue;
        const s = sample(`{${v[1]}}`);
        if (s !== "3" && !out.includes(s)) bad.push(`${id}: dropped {${v[1]}} → ${out}`);
      }
    }
    check(`${locale}: every entry formats with its values`, bad.length === 0, bad.slice(0, 4).join(" | ") || "ok");
  }
  const one = await translateError("That code doesn't match. 1 attempt left.", "mr-IN");
  check("an empty placeholder (\"s\" suffix) still matches", /[ऀ-ॿ]/.test(one) && one.includes("1"), one);
  check("English stays as written", (await translateError("Not authenticated", "en-IN")) === "Not authenticated", "en-IN");
  check("a message not in the catalog stays English", (await translateError("Some brand new problem.", "mr-IN")) === "Some brand new problem.", "mr-IN");

  // ── Live API ──
  const call = (url: string, lang: string | null, init: RequestInit = {}) =>
    fetch(`${BASE}${url}`, { ...init, headers: { "Content-Type": "application/json", ...(lang ? { Cookie: `doconclick_lang=${lang}` } : {}), ...(init.headers ?? {}) } })
      .then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})), type: r.headers.get("content-type") ?? "" }));

  for (const [lang, expect] of [[null, "Not authenticated"], ["en-IN", "Not authenticated"], ["hi-IN", null], ["mr-IN", null]] as const) {
    const r = await call("/api/appointments", lang, { method: "POST", body: "{}" });
    const ok = r.status === 401 && typeof r.json.error === "string" && (expect ? r.json.error === expect : /[ऀ-ॿ]/.test(r.json.error)) && r.type.includes("application/json");
    check(`401 in ${lang ?? "no cookie"}`, ok, `${r.status} ${r.json.error}`);
  }
  let r = await call("/api/auth/language", "mr-IN", { method: "PUT", body: JSON.stringify({ language: "fr-FR" }) });
  check("400 from a route translates (mr-IN)", r.status === 400 && /[ऀ-ॿ]/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
  r = await call("/api/patients/register", "hi-IN", { method: "POST", body: JSON.stringify({ mobile: `9${String(Date.now()).slice(-9)}`, password: "ab" }) });
  check("templated lib message translates with its number (hi-IN)", r.status === 400 && /[ऀ-ॿ]/.test(r.json.error ?? "") && /\d/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
  r = await call("/api/patients/register", "en-IN", { method: "POST", body: JSON.stringify({ mobile: `9${String(Date.now()).slice(-9)}`, password: "ab" }) });
  check("…and stays English for en-IN", r.status === 400 && /^Password must be at least \d+ characters\.$/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
  r = await call("/api/health", "mr-IN");
  check("a successful response is untouched", r.status === 200, `${r.status}`);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
