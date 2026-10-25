// P2-34: a user's page language never leaks to the next sign-in on the same
// browser. Login sets doconclick_lang from the account's own language, logout
// clears it, a stale cookie can't reach an English admin. Against a live
// server + the .env DB, throwaway users only.
//
//   npm run test:lang-session        (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}
const langOf = (res: Response) => {
  const c = res.headers.getSetCookie().find((x) => x.startsWith("doconclick_lang="));
  return c ? c.split(";")[0].split("=")[1] : undefined; // "" = cleared, undefined = untouched
};
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((x) => x.startsWith(`${name}=`))?.split(";")[0];

async function main() {
  const stamp = String(Date.now()).slice(-7);
  const pw = "Test@12345";
  const hash = await hashPassword(pw);
  const mk = (n: string, role: string, language: string) => prisma.user.create({ data: { name: `Lang ${n}`, mobile: n, role, language, password: hash, termsAcceptedAt: new Date() } });
  const mr = await mk(`9${stamp}11`, "PATIENT", "mr-IN");
  const admin = await mk(`9${stamp}22`, "ADMIN", "en-IN");
  const login = (mobile: string, cookie?: string) =>
    fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ mobile, password: pw }) });
  try {
    const r1 = await login(mr.mobile);
    check("mr user signs in -> cookie mr-IN", langOf(r1) === "mr-IN", String(langOf(r1)));

    const out = await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { Cookie: `${cookieOf(r1, "doconclick_token")}; doconclick_lang=mr-IN` } });
    check("logout clears the language cookie", langOf(out) === "", JSON.stringify(langOf(out)));

    // Same browser, stale mr cookie still present (e.g. session expired, no logout call).
    const r2 = await login(admin.mobile, "doconclick_lang=mr-IN");
    check("English admin signs in over a stale mr cookie -> en-IN", langOf(r2) === "en-IN", String(langOf(r2)));
    const tok = cookieOf(r2, "doconclick_token");
    const html = await (await fetch(`${BASE}/admin`, { headers: { Cookie: `${tok}; doconclick_lang=${langOf(r2)}` } })).text();
    check("admin page renders lang=en-IN", /<html[^>]*lang="en-IN"/.test(html), (html.match(/<html[^>]*>/) ?? ["?"])[0]);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [mr.id, admin.id] } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
