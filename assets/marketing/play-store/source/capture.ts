// Captures real app screens for Play Store art from the running dev server
// (http://localhost:3000). Raw captures go to the gitignored
// .pipeline/playstore/raw/<kind>/ folder; compose.ts frames them. Usage:
//   npx tsx assets/marketing/play-store/source/capture.ts <phone|tablet> <role> <route[,route...]>
// Set LANG_CODE=mr-IN (or hi-IN) to show another language. The language is
// faked in the browser only; nothing is written to the database.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [kind, role, routesArg] = process.argv.slice(2);
const LOGINS: Record<string, [string, string]> = {
  patient: ["9876543210", "Patient@2025"],
  doctor: ["9000000001", "Doctor@2025"],
};
const VP = kind === "tablet" ? { width: 800, height: 1200, dpr: 2 } : { width: 390, height: 800, dpr: 2 };
const DEMO_TEXT: Record<string, string> = {
  "test": "Follow-up for skin allergy",
  "i have fever": "Fever and body ache since 2 days",
  "test test": "Aarav Sharma",
  "T": "A",
  "Son · 21 yrs · Male · A-": "Son · 12 yrs · Male · B+",
};
if (!kind || !role || !routesArg) {
  console.error("usage: capture.ts <phone|tablet> <patient|doctor> <route[,route...]>");
  process.exit(1);
}
const ROOT = path.join(__dirname, "..", "..", "..", "..");
const OUT = path.join(ROOT, ".pipeline", "playstore", "raw", kind);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: "http://localhost:3000",
    viewport: { width: VP.width, height: VP.height },
    deviceScaleFactor: VP.dpr, isMobile: true, hasTouch: true,
    locale: "en-IN", timezoneId: "Asia/Kolkata",
    geolocation: { latitude: 18.5204, longitude: 73.8567 }, permissions: ["geolocation", "notifications"],
  });
  if (LOGINS[role]) {
    const [mobile, password] = LOGINS[role];
    const r = await context.request.post("/api/auth/login", { data: { mobile, password } });
    if (!r.ok()) throw new Error(`login ${r.status()}`);
  }
  await context.addInitScript("window.__name = (f) => f");
  await context.addInitScript("try { sessionStorage.setItem('profilePromptSeen', '1') } catch {}");
  await context.addCookies([{ name: "doconclick_lang", value: process.env.LANG_CODE ?? "en-IN", url: "http://localhost:3000" }]);
  // Show the wanted language without writing it to the account: AuthProvider
  // otherwise syncs cookie <-> User.language (and PUTs it to the DB).
  const lang = process.env.LANG_CODE ?? "en-IN";
  await context.route("**/api/auth/me", async (route) => {
    const res = await route.fetch();
    const body = await res.json().catch(() => null);
    if (body && typeof body === "object") body.language = lang;
    await route.fulfill({ response: res, json: body });
  });
  await context.route("**/api/auth/language", (route) => route.fulfill({ json: { language: lang } }));
  const page = await context.newPage();
  for (const route of routesArg.split(",")) {
    await page.goto(route, { waitUntil: "load", timeout: 90_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.waitForTimeout(route.includes("dashboard") ? 6000 : 2500);
    // Clinic pins sometimes miss the first render — reload until they show.
    for (let i = 0; route.includes("dashboard") && i < 5; i++) {
      const pins = await page.locator(".leaflet-marker-icon").count();
      console.log("pins", pins);
      if (pins > 2) break;
      // Map refresh button re-places the markers (see dashboard boot race).
      await page.locator("button:has(svg.lucide-refresh-cw)").first().click().catch(() => {});
      await page.waitForTimeout(6000);
    }
    // Swap leftover QA test data for realistic demo text (display only, DB untouched).
    await page.evaluate((map) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.textContent ?? "").trim();
        if (t in map) n.textContent = map[t];
        else if (/TEST DATA/i.test(t)) n.textContent = (n.textContent ?? "").replace(/\s*\(?TEST DATA[^)]*\)?/gi, "");
      }
      // Headless Chromium has push "denied": drop the browser-only blocked banner.
      for (const b of Array.from(document.querySelectorAll("button"))) {
        if (/notification settings/i.test(b.textContent ?? "")) (b.closest(".bg-amber-50") as HTMLElement | null)?.style.setProperty("display", "none");
      }
    }, DEMO_TEXT);
    await page.waitForTimeout(300);
    const name = `${role}${route.replace(/[/?=&]+/g, "_")}.png`;
    await page.screenshot({ path: path.join(OUT, name) });
    console.log(name, "->", new URL(page.url()).pathname);
  }
  await browser.close();
})();
