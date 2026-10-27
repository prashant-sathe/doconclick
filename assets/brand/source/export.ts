// Renders assets/brand/svg/*.svg to the PNG sizes in assets/brand/png and
// builds favicon.ico (16/32/48).
//   npx tsx assets/brand/source/export.ts
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BRAND = path.join(__dirname, "..");
const SVG = path.join(BRAND, "svg");
const PNG = path.join(BRAND, "png");

// [svg, output folder, widths]. Heights follow each SVG's aspect ratio.
const JOBS: [string, string, number[]][] = [
  ["logo-horizontal", "logo", [600, 1200, 2400]],
  ["logo-horizontal-dark", "logo", [600, 1200, 2400]],
  ["logo-stacked", "logo", [600, 1200, 2400]],
  ["logo-stacked-dark", "logo", [600, 1200, 2400]],
  ["mark", "mark", [256, 512, 1024, 2048]],
  ["mark-white", "mark", [256, 512, 1024, 2048]],
  ["app-icon", "app-icon", [180, 192, 512, 1024]],
  ["favicon", "favicon", [16, 32, 48, 180, 192, 512]],
  // Native app sources: assets/ (for @capacitor/assets) and the Android
  // status-bar icon at mdpi..xxxhdpi.
  ["native/icon-background", "native", [1024]],
  ["native/icon-foreground", "native", [1024]],
  ["native/splash", "native", [2732]],
  ["native/notification", "native", [24, 36, 48, 72, 96]],
];
// Full-bleed squares with no transparency.
const OPAQUE = new Set(["app-icon", "native/icon-background", "native/splash"]);

// ICO with embedded PNG images (supported by every current browser).
function ico(pngs: Buffer[], sizes: number[]) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((png, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(sizes[i] % 256, e); head.writeUInt8(sizes[i] % 256, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs]);
}

(async () => {
  const browser = await chromium.launch();
  for (const [name, folder, widths] of JOBS) {
    const svg = fs.readFileSync(path.join(SVG, `${name}.svg`), "utf8");
    const [, vw, vh] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!.map(Number);
    fs.mkdirSync(path.join(PNG, folder), { recursive: true });
    for (const w of widths) {
      const h = Math.round((w * vh) / vw);
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const sized = svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${w}" height="${h}"`);
      await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
      const out = path.join(PNG, folder, `${path.basename(name)}-${w}.png`);
      await page.screenshot({ path: out, omitBackground: !OPAQUE.has(name) });
      await page.close();
      console.log(path.relative(BRAND, out));
    }
  }
  await browser.close();
  const sizes = [16, 32, 48];
  const out = path.join(PNG, "favicon", "favicon.ico");
  fs.writeFileSync(out, ico(sizes.map((s) => fs.readFileSync(path.join(PNG, "favicon", `favicon-${s}.png`))), sizes));
  console.log(path.relative(BRAND, out));
})();
