// Visual QA: signs in as a role, opens pages in a real browser (Chromium via
// Playwright) at phone / tablet / desktop widths and en/hi/mr, saves a
// screenshot of each and flags what a human would notice — console and
// hydration errors, failed API calls, sideways scrolling and the elements
// causing it, broken images, untranslated "ns.key" text, tiny tap targets.
// The QA agent reads the PNGs back to judge the layout itself.
//
//   npx tsx scripts/ui-check.ts --role patient
//   npx tsx scripts/ui-check.ts --role doctor --routes /doctor/dashboard,/doctor/walk-in --lang all
//   npx tsx scripts/ui-check.ts --role nurse --login 9xxxxxxxxx:Password --viewports mobile
//   npx tsx scripts/ui-check.ts --role public --base http://localhost:3100
//
// Options: --role admin|patient|doctor|nurse|staff|public · --login mobile:password
// (required for nurse/staff — the seed has none) · --routes a,b (default: every
// static page of the role) · --viewports mobile,tablet,desktop · --lang en|hi|mr|all
// (default en) · --base URL (default http://localhost:3000) · --out DIR
// (default .pipeline/ui/<time>-<role>).
//
// Read-only: it only signs in and GETs pages, never submits forms. For a
// click-through flow, import openSession()/checkPage() into a throwaway script.
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { APP_LANGUAGE_COOKIE } from "../src/lib/appLanguage";

const ROOT = path.join(__dirname, "..");

export const VIEWPORTS = {
  // Low-end Android width; below lg (1024px) the shells use the bottom tab bar.
  mobile: { width: 360, height: 800, isMobile: true, hasTouch: true },
  tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true },
  desktop: { width: 1280, height: 800, isMobile: false, hasTouch: false },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

const LANGS = ["en", "hi", "mr"] as const;
type Lang = (typeof LANGS)[number];

// prisma/seed.ts accounts. Nurse and staff accounts aren't seeded — pass --login.
const SEED_LOGINS: Record<string, string> = {
  admin: "9999999999:Admin@2025",
  patient: "9876543210:Patient@2025",
  doctor: "9000000001:Doctor@2025",
};

const ROLE_ROUTES: Record<string, string[]> = {
  public: ["/", "/about", "/contact", "/login", "/forgot-password", "/privacy-policy", "/data-deletion", "/patient/register", "/doctor/register", "/nurse/register"],
  patient: [
    "/patient/dashboard", "/patient/book", "/patient/nurse", "/patient/appointments", "/patient/saved",
    "/patient/assistant", "/patient/wallet", "/patient/inbox", "/patient/support", "/patient/profile",
    "/patient/profile/personal", "/patient/profile/address", "/patient/profile/emergency", "/patient/profile/family",
    "/patient/profile/search-range", "/patient/profile/notifications", "/patient/profile/documents",
    "/patient/profile/vitals", "/patient/profile/security",
  ],
  doctor: [
    "/doctor/dashboard", "/doctor/walk-in", "/doctor/clinics", "/doctor/earnings", "/doctor/analytics", "/doctor/inbox",
    "/doctor/support", "/doctor/subscribe", "/doctor/profile", "/doctor/profile/availability", "/doctor/profile/bank",
    "/doctor/profile/consultation", "/doctor/profile/documents", "/doctor/profile/professional", "/doctor/profile/qr",
    "/doctor/profile/staff", "/doctor/profile/notifications", "/doctor/profile/security",
  ],
  nurse: ["/nurse/dashboard", "/nurse/earnings", "/nurse/inbox", "/nurse/notifications", "/nurse/profile", "/nurse/security", "/nurse/support"],
  staff: ["/doctor/dashboard", "/doctor/walk-in"],
  admin: [
    "/admin", "/admin/bookings", "/admin/doctors", "/admin/nurses", "/admin/patients", "/admin/finance", "/admin/wallets",
    "/admin/coupons", "/admin/announcements", "/admin/complaints", "/admin/reports", "/admin/specialties",
    "/admin/nurse-services", "/admin/settings", "/admin/inbox",
  ],
};

export type PageReport = {
  route: string;
  viewport: ViewportName;
  lang: Lang;
  screenshot: string;
  finalUrl: string;
  status: number | null;
  issues: string[];
};

export async function openSession(opts: {
  base: string;
  viewport: ViewportName;
  lang: Lang;
  login?: string; // "mobile:password"; omit for a signed-out session
  browser?: Browser;
}): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = opts.browser ?? (await chromium.launch());
  const { width, height, isMobile, hasTouch } = VIEWPORTS[opts.viewport];
  const context = await browser.newContext({
    baseURL: opts.base,
    viewport: { width, height },
    isMobile,
    hasTouch,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    locale: opts.lang === "en" ? "en-IN" : `${opts.lang}-IN`,
    timezoneId: "Asia/Kolkata",
  });
  if (opts.login) {
    const sep = opts.login.indexOf(":");
    const res = await context.request.post("/api/auth/login", {
      data: { mobile: opts.login.slice(0, sep), password: opts.login.slice(sep + 1) },
    });
    if (!res.ok()) throw new Error(`Login failed (${res.status()}): ${await res.text()}`);
  }
  // tsx compiles with esbuild keepNames, which wraps functions we hand to
  // page.evaluate() in a __name() helper that doesn't exist in the browser.
  await context.addInitScript("window.__name = (f) => f");
  // The patient dashboard bounces an incomplete profile to /patient/profile
  // once per session — mark that prompt seen so the dashboard itself is shot.
  await context.addInitScript("try { sessionStorage.setItem('profilePromptSeen', '1') } catch {}");
  // Sign-in sets the language cookie from User.language — override it after.
  const host = new URL(opts.base).hostname;
  await context.addCookies([{ name: APP_LANGUAGE_COOKIE, value: `${opts.lang}-IN`, domain: host, path: "/" }]);
  return { browser, context, page: await context.newPage() };
}

/** Opens `route` on `page`, screenshots it to `shotPath` and returns what looks wrong. */
export async function checkPage(page: Page, route: string, shotPath: string) {
  const issues: string[] = [];
  // Only our own server's calls — third-party (maps, fonts, analytics) noise is skipped.
  const ours = (u: string) => {
    const here = page.url();
    return !u.includes("/_next/") && !u.includes("webpack-hmr") &&
      (here.startsWith("http") ? new URL(u).host === new URL(here).host : u.startsWith("http://localhost"));
  };
  const onConsole = (m: { type(): string; text(): string }) => {
    const text = m.text();
    if (m.type() === "error") issues.push(`console error: ${text.slice(0, 300)}`);
    else if (/hydrat|MISSING_MESSAGE/i.test(text)) issues.push(`console ${m.type()}: ${text.slice(0, 300)}`);
  };
  const onPageError = (e: Error) => issues.push(`page error: ${e.message.slice(0, 300)}`);
  const onResponse = (r: { url(): string; status(): number; request(): { method(): string } }) => {
    const u = r.url();
    if (r.status() >= 400 && ours(u)) issues.push(`HTTP ${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, "")}`);
  };
  const onFailed = (r: { url(): string; failure(): { errorText: string } | null }) => {
    if (ours(r.url())) issues.push(`request failed: ${r.url().replace(/^https?:\/\/[^/]+/, "")} (${r.failure()?.errorText})`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  page.on("requestfailed", onFailed);

  let status: number | null = null;
  try {
    const res = await page.goto(route, { waitUntil: "load", timeout: 60_000 });
    status = res?.status() ?? null;
    if (status && status >= 400) issues.push(`document HTTP ${status}`);
    // AuthProvider polls and next dev keeps an HMR socket, so "idle" may never come.
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(600);

    const finalPath = new URL(page.url()).pathname;
    if (finalPath !== route.split("?")[0]) issues.push(`redirected to ${finalPath}`);

    const dom = await page.evaluate(() => {
      const vw = window.innerWidth;
      const out = { overflowPx: 0, overflowing: [] as string[], brokenImages: [] as string[], rawKeys: [] as string[], smallTargets: [] as string[] };
      const describe = (el: Element) => {
        const id = el.id ? `#${el.id}` : "";
        const cls = typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        return `<${el.tagName.toLowerCase()}${id}${cls === "." ? "" : cls}> "${text}"`;
      };
      const clipped = (el: Element) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
        }
        return false;
      };
      out.overflowPx = Math.max(0, document.documentElement.scrollWidth - vw);
      if (out.overflowPx > 1) {
        for (const el of Array.from(document.body.querySelectorAll("*"))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1 && !clipped(el)) {
            // Report the outermost offender, not every descendant.
            if (!out.overflowing.some((d) => d === describe(el.parentElement!))) out.overflowing.push(describe(el));
            if (out.overflowing.length >= 6) break;
          }
        }
      }
      for (const img of Array.from(document.images)) {
        if (img.complete && img.naturalWidth === 0 && img.getBoundingClientRect().width > 0) out.brokenImages.push(img.currentSrc || img.src);
      }
      // next-intl renders a missing message as its "namespace.key" path.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = (n.textContent ?? "").trim();
        if (/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/.test(t) && !/\.(com|in|png|jpg|pdf)$/.test(t) && n.parentElement?.offsetParent !== null) {
          out.rawKeys.push(t);
          if (out.rawKeys.length >= 10) break;
        }
      }
      if (navigator.maxTouchPoints > 0) {
        for (const el of Array.from(document.querySelectorAll("button, a[href], [role=button], input, select"))) {
          const r = el.getBoundingClientRect();
          // tap-44 / tap-44-y (globals.css) grow the touch area with ::after.
          const cls = typeof el.className === "string" ? el.className.split(/\s+/) : [];
          if (cls.includes("tap-44") || el.closest(".leaflet-control-attribution")) continue;
          const short = r.height < 32 && !cls.includes("tap-44-y");
          if (r.width > 0 && r.height > 0 && (r.width < 32 || short) && getComputedStyle(el).visibility !== "hidden") {
            out.smallTargets.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
            if (out.smallTargets.length >= 5) break;
          }
        }
      }
      return out;
    });
    if (dom.overflowPx > 1) issues.push(`horizontal scroll by ${dom.overflowPx}px — ${dom.overflowing.join(" | ") || "offender not found"}`);
    for (const src of dom.brokenImages) issues.push(`broken image: ${src}`);
    if (dom.rawKeys.length) issues.push(`untranslated keys on screen: ${dom.rawKeys.join(", ")}`);
    if (dom.smallTargets.length) issues.push(`tap targets under 32px: ${dom.smallTargets.join(" | ")}`);

    fs.mkdirSync(path.dirname(shotPath), { recursive: true });
    await page.screenshot({ path: shotPath, fullPage: true });
  } catch (e) {
    issues.push(`could not load: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
    page.off("requestfailed", onFailed);
  }
  return { finalUrl: page.url(), status, issues: [...new Set(issues)] };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const role = arg("role") ?? "public";
  if (!ROLE_ROUTES[role]) throw new Error(`Unknown --role ${role}`);
  const login = role === "public" ? undefined : (arg("login") ?? SEED_LOGINS[role]);
  if (role !== "public" && !login) throw new Error(`--login mobile:password is required for --role ${role}`);
  const base = (arg("base") ?? "http://localhost:3000").replace(/\/$/, "");
  const routes = arg("routes")?.split(",").map((r) => r.trim()).filter(Boolean) ?? ROLE_ROUTES[role];
  const viewports = (arg("viewports")?.split(",") ?? Object.keys(VIEWPORTS)) as ViewportName[];
  for (const v of viewports) if (!VIEWPORTS[v]) throw new Error(`Unknown viewport ${v}`);
  const langArg = arg("lang") ?? "en";
  const langs = (langArg === "all" ? [...LANGS] : langArg.split(",")) as Lang[];
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const outDir = path.resolve(ROOT, arg("out") ?? `.pipeline/ui/${stamp}-${role}`);

  const browser = await chromium.launch();
  const reports: PageReport[] = [];
  try {
    for (const lang of langs) {
      for (const viewport of viewports) {
        // One sign-in per viewport × language keeps us far below the login rate limit.
        const { context, page } = await openSession({ base, viewport, lang, login, browser });
        for (const route of routes) {
          const slug = route.replace(/^\//, "").replace(/[^A-Za-z0-9]+/g, "-") || "home";
          const screenshot = path.join(outDir, `${slug}__${viewport}__${lang}.png`);
          const r = await checkPage(page, route, screenshot);
          reports.push({ route, viewport, lang, screenshot: path.relative(ROOT, screenshot), ...r });
          console.log(`${r.issues.length ? "✗" : "✓"} ${route} [${viewport}/${lang}]${r.issues.length ? ` — ${r.issues.length} issue(s)` : ""}`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(reports, null, 2));
  const bad = reports.filter((r) => r.issues.length);
  const md = [
    `# UI check — ${role} @ ${base} (${stamp})`,
    `${reports.length} screens, ${bad.length} with issues. Screenshots are in this folder — open them to judge layout, spacing, overlap and contrast; the checks below only catch what can be measured.`,
    "",
    ...bad.flatMap((r) => [`## ${r.route} — ${r.viewport} / ${r.lang}`, `![](${path.basename(r.screenshot)})`, ...r.issues.map((i) => `- ${i}`), ""]),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "report.md"), md);
  console.log(`\n${bad.length}/${reports.length} screens with issues → ${path.relative(ROOT, outDir)}/report.md`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
