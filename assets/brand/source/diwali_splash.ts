// Diwali edition of the in-app splash (Admin → Settings → splash image).
// Same canvas, fit and logo as the regular splash (logo-stacked, 2400×1664,
// transparent, shown "contain" on the splash background colour) — the
// wordmark and tagline are untouched; only the mark gets festive: a warm glow
// and a rangoli ring behind the plus, a lit diya inside the heart, a diya on
// each side, a few sparkles, and "शुभ दीपावली" above the wordmark.
//
//   npx tsx assets/brand/source/diwali_splash.ts
//   → assets/brand/png/festive/diwali-splash-2400.png  (+ a preview on #F8FAFC)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BRAND = path.join(__dirname, "..");
const OUT = path.join(BRAND, "png", "festive");
const W = 2400;
const H = 1664;

const base = fs.readFileSync(path.join(BRAND, "svg", "logo-stacked.svg"), "utf8");
const defsEnd = base.indexOf("</defs>");
const bodyStart = defsEnd + "</defs>".length;
const baseDefs = base.slice(base.indexOf("<defs>") + "<defs>".length, defsEnd);
const body = base.slice(bodyStart, base.lastIndexOf("</svg>"));

// Mark geometry in the 952×660 viewBox (see logo-stacked.svg): the plus is
// centred on (476, 210); the heart sits at (476, 205), ~94 wide.
const CX = 476;
const CY = 210;

const defs = `
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#FDE68A" stop-opacity=".95"/>
    <stop offset=".45" stop-color="#FBBF24" stop-opacity=".38"/>
    <stop offset="1" stop-color="#F59E0B" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="flameGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#FFE9A8" stop-opacity=".9"/>
    <stop offset="1" stop-color="#FDBA74" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#EA580C"/>
    <stop offset=".55" stop-color="#F59E0B"/>
    <stop offset="1" stop-color="#FDE047"/>
  </linearGradient>
  <linearGradient id="bowl" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F59E0B"/>
    <stop offset="1" stop-color="#B45309"/>
  </linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#F59E0B"/>
    <stop offset="1" stop-color="#EA580C"/>
  </linearGradient>
  <!-- A diya centred on its rim at (0,0): bowl below, flame above. -->
  <g id="diya">
    <circle cx="0" cy="-22" r="30" fill="url(#flameGlow)"/>
    <path d="M-34 0 Q-30 22 0 24 Q30 22 34 0 Z" fill="url(#bowl)"/>
    <ellipse cx="0" cy="0" rx="34" ry="6.5" fill="#FCD34D"/>
    <ellipse cx="0" cy="0" rx="26" ry="3.6" fill="#B45309" opacity=".55"/>
    <circle cx="-17" cy="12" r="2.4" fill="#FEF3C7"/><circle cx="0" cy="15" r="2.4" fill="#FEF3C7"/><circle cx="17" cy="12" r="2.4" fill="#FEF3C7"/>
    <path d="M0 -44 C9 -31 12 -18 0 -3 C-12 -18 -9 -31 0 -44 Z" fill="url(#flame)"/>
    <path d="M0 -30 C4 -22 5 -14 0 -7 C-5 -14 -4 -22 0 -30 Z" fill="#FFF7D6"/>
  </g>
  <!-- Four-point sparkle, centred, unit size ~1. -->
  <path id="spark" d="M0 -1 C.12 -.12 .12 -.12 1 0 C.12 .12 .12 .12 0 1 C-.12 .12 -.12 .12 -1 0 C-.12 -.12 -.12 -.12 0 -1 Z"/>
`;

// Rangoli ring: a dotted circle, then small petals around it — left open at
// the bottom, where "शुभ दीपावली" sits.
const OPEN_BOTTOM = (deg: number) => deg > 140 && deg < 220;
const petals = Array.from({ length: 16 }, (_, i) => {
  const a = (i * 360) / 16;
  if (OPEN_BOTTOM(a)) return "";
  return `<ellipse cx="${CX}" cy="${CY - 172}" rx="4.6" ry="10" fill="${i % 2 ? "#F59E0B" : "#EA580C"}" opacity=".9" transform="rotate(${a} ${CX} ${CY})"/>`;
}).join("");
const dots = Array.from({ length: 16 }, (_, i) => {
  const a = ((i + 0.5) * 2 * Math.PI) / 16;
  if (OPEN_BOTTOM((a * 180) / Math.PI)) return "";
  return `<circle cx="${(CX + 172 * Math.sin(a)).toFixed(1)}" cy="${(CY - 172 * Math.cos(a)).toFixed(1)}" r="3" fill="#FBBF24"/>`;
}).join("");

const behind = `
  <circle cx="${CX}" cy="${CY}" r="215" fill="url(#glow)"/>
  <circle cx="${CX}" cy="${CY}" r="158" fill="none" stroke="#F59E0B" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="0 11" opacity=".85"/>
  ${petals}${dots}
`;

const sparks = [
  [258, 92, 13], [700, 78, 16], [300, 210, 8], [660, 250, 9], [150, 300, 7], [810, 200, 10], [395, 70, 7], [575, 60, 9],
].map(([x, y, s]) => `<use href="#spark" transform="translate(${x} ${y}) scale(${s})" fill="url(#gold)"/>`).join("");

const front = `
  <!-- the heart becomes a lamp -->
  <use href="#diya" transform="translate(${CX} 226) scale(.62)"/>
  <!-- a diya each side of the plus -->
  <use href="#diya" transform="translate(222 318) scale(1.25)"/>
  <use href="#diya" transform="translate(730 318) scale(1.25)"/>
  ${sparks}
  <text x="${CX}" y="414" text-anchor="middle" font-family="Kohinoor Devanagari, Mukta Mahee, Noto Sans Devanagari, sans-serif"
        font-size="30" font-weight="600" fill="#C2410C" letter-spacing="1">✦ शुभ दीपावली ✦</text>
`;

// Draw: glow + rangoli, then the logo, then the lamps on top.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 952 660" width="${W}" height="${H}"><defs>${baseDefs}${defs}</defs>${behind}${body}${front}</svg>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(BRAND, "svg", "diwali-splash.svg"), svg);
  const browser = await chromium.launch();
  for (const [name, bg] of [["diwali-splash-2400", null], ["diwali-splash-preview", "#F8FAFC"]] as const) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.setContent(`<html><body style="margin:0;background:${bg ?? "transparent"}">${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: !bg });
    await page.close();
  }
  await browser.close();
  console.log("wrote", path.join(OUT, "diwali-splash-2400.png"));
})();
