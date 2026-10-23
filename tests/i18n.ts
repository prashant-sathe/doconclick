// i18n (next-intl, src/i18n): every message key exists in en-IN, hi-IN and
// mr-IN; Hindi and Marathi are written in Devanagari; every ICU message
// formats in every language (push texts with sample values included); the
// language switch API saves the choice on the account and the cookie, and
// pages render in it. Pure checks, then against a live dev server and the DB
// in .env, throwaway users only.
//
//   npm run test:i18n        (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { createTranslator } from "use-intl/core";
import { prisma } from "../src/lib/prisma";
import { NAMESPACES } from "../src/i18n/messages";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const LOCALES = ["en-IN", "hi-IN", "mr-IN"] as const;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type Tree = { [k: string]: string | Tree };
const read = (locale: string, ns: string): Tree => JSON.parse(fs.readFileSync(path.join("messages", locale, `${ns}.json`), "utf8"));
const leaves = (t: Tree, prefix = ""): [string, string][] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));

// Sample values for every {placeholder} a message uses.
function sampleValues(message: string): Record<string, string | number | Date> {
  const out: Record<string, string | number | Date> = {};
  for (const m of message.matchAll(/\{\s*([A-Za-z_][\w]*)\s*(?:,\s*(\w+))?/g)) {
    const [, name, kind] = m;
    if (name in out) continue;
    out[name] = kind === "plural" || kind === "number" ? 2 : kind === "date" || kind === "time" ? new Date("2026-10-23T10:30:00+05:30") : kind === "select" ? "other" : "Sample";
  }
  return out;
}

async function main() {
  // ── Catalogues ──
  for (const ns of NAMESPACES) {
    const en = leaves(read("en-IN", ns));
    const enKeys = new Set(en.map(([k]) => k));
    for (const locale of ["hi-IN", "mr-IN"]) {
      const other = leaves(read(locale, ns));
      const keys = new Set(other.map(([k]) => k));
      const missing = [...enKeys].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !enKeys.has(k));
      check(`${ns}: ${locale} has every en-IN key, no extras`, missing.length === 0 && extra.length === 0, missing.length || extra.length ? `missing ${missing.slice(0, 5).join(", ")} extra ${extra.slice(0, 5).join(", ")}` : `${keys.size} keys`);
      // Text outside {…} and <tags>, minus brand words/numbers, should contain Devanagari.
      const latinOnly = other.filter(([, v]) => {
        // Drop ICU syntax — {placeholders}, "x, select/plural" headers and
        // "option {" labels — and tags, then brand words and punctuation.
        const text = v
          .replace(/\{\s*\w+\s*,\s*(select|plural|selectordinal|date|time|number)\s*,?/g, " ")
          .replace(/(^|[\s}])(=?\w+)\s*\{/g, "$1 ")
          .replace(/\{\s*\w+\s*\}/g, " ")
          .replace(/[{}]/g, " ")
          .replace(/<\/?\w+>/g, "")
          .replace(/DocOnClick|Cashfree|UPI|WhatsApp|AI|OTP|PDF|JPG|PNG|SpO2|BP|CBC|COPD|ID|Dr\.|Nurse|km|pm|am|PM|AM|₹|#|[\d\s.,:;!?()/\-–—·'"%+*@&…→]/g, "");
        return text.length > 0 && !/[\u0900-\u097F]/.test(text);
      });
      check(`${ns}: ${locale} text is in Devanagari`, latinOnly.length === 0, latinOnly.slice(0, 4).map(([k, v]) => `${k}="${v}"`).join(" | ") || "ok");
      const broken = other.filter(([, v]) => /अॅ/.test(v));
      if (locale === "mr-IN") check(`${ns}: mr-IN uses ॲ, not अॅ`, broken.length === 0, broken.slice(0, 3).map(([k]) => k).join(", ") || "ok");
    }
  }

  // ── Every message formats in every language ──
  const { loadMessages } = await import("../src/i18n/messages");
  for (const locale of LOCALES) {
    const messages = await loadMessages(locale);
    const t = createTranslator({ locale, messages, timeZone: "Asia/Kolkata" }) as unknown as { (k: string, v?: object): string; rich: (k: string, v?: object) => unknown };
    const bad: string[] = [];
    for (const ns of NAMESPACES) {
      for (const [key, en] of leaves(read("en-IN", ns))) {
        const values: Record<string, unknown> = sampleValues(en);
        for (const tag of en.matchAll(/<(\w+)>/g)) values[tag[1]] = (c: unknown) => c;
        try {
          const out = /<\w+>/.test(en) ? JSON.stringify(t.rich(`${ns}.${key}`, values)) : t(`${ns}.${key}`, values);
          if (/\{\w+\}|\bns\.|^\s*$/.test(String(out)) && en.trim()) bad.push(`${ns}.${key} → ${out}`);
        } catch (e) {
          bad.push(`${ns}.${key}: ${(e as Error).message.slice(0, 80)}`);
        }
      }
    }
    check(`${locale}: every message formats`, bad.length === 0, bad.slice(0, 4).join(" | ") || "ok");
  }

  // ── API + rendering ──
  const stamp = String(Date.now()).slice(-7);
  const user = await prisma.user.create({ data: { name: "Lang Patient", mobile: `9${stamp}88`, role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 30, gender: "Male" } } } });
  const cookie = `doconclick_token=${jwt.sign({ id: user.id, name: user.name, role: "PATIENT", mobile: user.mobile, tv: 0 }, SECRET)}`;
  const put = (language: unknown, auth = true) =>
    fetch(`${BASE}/api/auth/language`, { method: "PUT", headers: { "Content-Type": "application/json", ...(auth ? { Cookie: cookie } : {}) }, body: JSON.stringify({ language }) });
  try {
    let r = await put("fr-FR");
    check("unsupported language → 400", r.status === 400, `${r.status}`);
    r = await put("mr-IN", false);
    check("signed out → 200, cookie only", r.status === 200 && /doconclick_lang=mr-IN/.test(r.headers.get("set-cookie") ?? ""), `${r.status} ${r.headers.get("set-cookie")}`);
    r = await put("hi-IN");
    check("signed in → saved on the account + cookie", r.status === 200 && (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).language === "hi-IN" && /doconclick_lang=hi-IN/.test(r.headers.get("set-cookie") ?? ""), `${r.status}`);
    const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } })).json();
    check("/api/auth/me returns the account language", me.language === "hi-IN", String(me.language));
    for (const [lang, word] of [["mr-IN", "डॉक्टर शोधा"], ["hi-IN", "डॉक्टर खोजें"], ["en-IN", "Find a Doctor"]] as const) {
      const html = await (await fetch(`${BASE}/patient/appointments`, { headers: { Cookie: `${cookie}; doconclick_lang=${lang}` } })).text();
      check(`page renders in ${lang} (<html lang>, nav)`, html.includes(`lang="${lang}"`) && html.includes(word), `${html.includes(`lang="${lang}"`)} / ${html.includes(word)}`);
    }
    const html = await (await fetch(`${BASE}/login`, { headers: { Cookie: "doconclick_lang=xx" } })).text();
    check("an unknown cookie value falls back to English", html.includes('lang="en-IN"'), "en-IN");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
