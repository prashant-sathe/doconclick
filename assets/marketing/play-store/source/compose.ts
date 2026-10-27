// Composes Play Store screenshots (phone 1080x1920, tablet 1600x2560) and the
// 1024x500 feature graphic from the raw captures that capture.ts writes to the
// gitignored .pipeline/playstore/raw/<kind>/. Output goes to
// assets/marketing/play-store/ (override with PLAYSTORE_OUT=<dir>).
//   npx tsx assets/marketing/play-store/source/compose.ts [phone|tablet|feature|all]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.join(__dirname, "..", "..", "..", "..");
const RAW = path.join(ROOT, ".pipeline", "playstore", "raw");
const OUT = process.env.PLAYSTORE_OUT ? path.resolve(process.env.PLAYSTORE_OUT) : path.join(__dirname, "..");
const b64 = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
const svg = (f: string) => `data:image/svg+xml;base64,${fs.readFileSync(f).toString("base64")}`;
const BRAND = path.join(ROOT, "assets", "brand", "svg");
const LOGO = svg(path.join(BRAND, "logo-horizontal.svg"));
const MARK = svg(path.join(BRAND, "mark.svg"));

type Slide = { file: string; shot: string; l1: string; l2: string; sub: string; deva?: boolean };
const SLIDES: Slide[] = [
  { file: "01-find-doctors", shot: "patient_patient_dashboard", l1: "Doctors Near You.", l2: "Right on the Map.", sub: "Find verified doctors & clinics around you — filter by specialty." },
  { file: "02-book-consultation", shot: "patient_patient_book", l1: "Care, Your Way.", l2: "Clinic · Video · Home.", sub: "Book a clinic visit, video consultation or home visit in a few taps." },
  { file: "03-home-nurse", shot: "patient_patient_nurse", l1: "Nursing Care.", l2: "At Your Doorstep.", sub: "Injections, IV drips, wound dressing & more — by registered nurses." },
  { file: "04-ai-assistant", shot: "patient_patient_assistant", l1: "Tell Us How You Feel.", l2: "We'll Guide You.", sub: "Our AI health assistant helps you find the right doctor." },
  { file: "05-appointments", shot: "patient_patient_appointments", l1: "Every Visit.", l2: "Under Control.", sub: "Track appointments, chat with your doctor & download receipts." },
  { file: "06-family", shot: "patient_patient_profile_family", l1: "One App.", l2: "Whole Family.", sub: "Add parents, kids & spouse — book care for them in seconds." },
  { file: "07-languages", shot: "patient_patient_book_mr", l1: "तुमच्या भाषेत.", l2: "In Your Language.", sub: "English  ·  हिंदी  ·  मराठी", deva: true },
  { file: "08-for-doctors", shot: "doctor_doctor_analytics", l1: "Your Practice.", l2: "Simplified.", sub: "For doctors: earnings, consultations & ratings — all in one place." },
];

const NAVY = "#0f2a5c";
const GREEN = "#16a36b";

const STATUS_ICONS = `
<svg viewBox="0 0 70 18" height="100%"><g fill="#111">
<rect x="0" y="12" width="3" height="6" rx="1"/><rect x="5" y="9" width="3" height="9" rx="1"/><rect x="10" y="5" width="3" height="13" rx="1"/><rect x="15" y="1" width="3" height="17" rx="1"/>
<path d="M33 17.5l-9-9.5a13 13 0 0118 0z"/>
<rect x="47" y="3" width="20" height="12" rx="3" fill="none" stroke="#111" stroke-width="1.6"/><rect x="49.5" y="5.5" width="13" height="7" rx="1.5"/><rect x="68" y="7" width="2" height="4" rx="1"/>
</g></svg>`;

function page(kind: "phone" | "tablet", s: Slide) {
  const T = kind === "phone"
    ? { W: 1080, H: 1920, logoW: 520, h: 98, sub: 38, subW: 880, top: 70, gap: 40, scrW: 560, bez: 16, rad: 86, sbar: 44, hole: 22 }
    : { W: 1600, H: 2560, logoW: 700, h: 128, sub: 50, subW: 1250, top: 90, gap: 56, scrW: 1100, bez: 34, rad: 64, sbar: 40, hole: 14 };
  const shot = path.join(RAW, kind, `${s.shot}.png`);
  const font = s.deva ? `'Outfit','Noto Sans Devanagari',sans-serif` : `'Outfit',sans-serif`;
  return `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@500;700;800&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:${T.W}px;height:${T.H}px;overflow:hidden;position:relative;font-family:'Outfit','Noto Sans Devanagari',sans-serif;
  background:linear-gradient(180deg,#e9f6f0 0%,#f4faf8 38%,#ffffff 70%,#f2f8f6 100%)}
.blob{position:absolute;border-radius:50%}
.b1{width:${T.W * 1.25}px;height:${T.W * 1.25}px;left:${-T.W * 0.55}px;top:${T.H * 0.24}px;background:radial-gradient(circle at 60% 40%,#d6efe5 0%,#e4f5ee 55%,rgba(228,245,238,0) 72%)}
.b2{width:${T.W * 0.9}px;height:${T.W * 0.9}px;right:${-T.W * 0.42}px;top:${T.H * 0.62}px;background:radial-gradient(circle,#dbe6f7 0%,rgba(219,230,247,0) 70%)}
.heart{position:absolute;width:${T.W * 0.46}px;height:${T.W * 0.46}px;right:${-T.W * 0.15}px;top:${T.H * 0.17}px;opacity:.06;transform:rotate(12deg)}
.heart2{position:absolute;width:${T.W * 0.24}px;height:${T.W * 0.24}px;left:${-T.W * 0.07}px;top:${T.H * 0.70}px;opacity:.05;transform:rotate(-14deg)}
.dots{position:absolute;left:${T.W * 0.06}px;top:${T.H * 0.30}px;width:${T.W * 0.14}px;height:${T.W * 0.14}px;
  background-image:radial-gradient(#9fd8c1 2.4px,transparent 2.6px);background-size:${T.W * 0.028}px ${T.W * 0.028}px;opacity:.7}
.wrap{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;padding-top:${T.top}px;height:100%}
.brand{display:block;width:${T.logoW}px;height:auto}
h1{margin-top:${T.gap}px;text-align:center;font-family:${font};font-weight:800;font-size:${T.h}px;line-height:1.08;letter-spacing:-1.5px}
h1 .a{color:${NAVY};display:block} h1 .c{color:${GREEN};display:block}
.sub{margin-top:${T.gap * 0.6}px;max-width:${T.subW}px;text-align:center;font-family:${font};font-size:${T.sub}px;line-height:1.3;color:${NAVY};font-weight:400}
.dev{margin-top:auto;margin-bottom:${kind === "phone" ? 60 : 80}px;position:relative;padding:${T.bez}px;border-radius:${T.rad}px;
  background:linear-gradient(145deg,#3a4049,#14171b 40%,#2b3037 75%,#0e1013);
  box-shadow:0 0 0 ${kind === "phone" ? 3 : 4}px #5b626c inset,0 ${T.W * 0.05}px ${T.W * 0.1}px rgba(15,42,92,.28),0 ${T.W * 0.012}px ${T.W * 0.025}px rgba(15,42,92,.18)}
.btn{position:absolute;right:-${kind === "phone" ? 7 : 8}px;width:${kind === "phone" ? 8 : 9}px;border-radius:0 4px 4px 0;background:linear-gradient(90deg,#2a2f36,#4a515b)}
.scr{position:relative;width:${T.scrW}px;border-radius:${T.rad - T.bez}px;overflow:hidden;background:#fff}
.sbar{height:${T.sbar}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${T.sbar * 0.75}px;font-family:'Outfit';font-weight:600;font-size:${T.sbar * 0.46}px;color:#111;background:#fff;position:relative}
.sbar .ic{height:${T.sbar * 0.36}px}
.hole{position:absolute;left:50%;top:50%;width:${T.hole}px;height:${T.hole}px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 35% 35%,#3b4a63,#05070a 60%)}
.scr img{display:block;width:100%}
${kind === "tablet" ? `.cam{position:absolute;left:50%;top:${T.bez / 2}px;width:10px;height:10px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle at 35% 35%,#3b4a63,#05070a 60%)}` : ""}
</style></head><body>
<div class="blob b1"></div><div class="blob b2"></div><div class="dots"></div>
<img class="heart" src="${MARK}"><img class="heart2" src="${MARK}">
<div class="wrap">
  <img class="brand" src="${LOGO}" alt="DocOnClick">
  <h1><span class="a">${s.l1}</span><span class="c">${s.l2}</span></h1>
  <div class="sub">${s.sub}</div>
  <div class="dev">
    ${kind === "phone" ? `<div class="btn" style="top:22%;height:${T.H * 0.06}px"></div><div class="btn" style="top:33%;height:${T.H * 0.1}px"></div>` : `<div class="cam"></div>`}
    <div class="scr">
      <div class="sbar"><span>9:41</span>${kind === "phone" ? `<div class="hole"></div>` : ""}<span class="ic">${STATUS_ICONS}</span></div>
      <img src="${b64(shot)}">
    </div>
  </div>
</div></body></html>`;
}

function feature() {
  const shot = b64(path.join(RAW, "phone", "patient_patient_book.png"));
  const map = b64(path.join(RAW, "phone", "patient_patient_dashboard.png"));
  return `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;800&display=block" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}
body{width:1024px;height:500px;overflow:hidden;position:relative;font-family:'Outfit',sans-serif;background:linear-gradient(120deg,#e9f6f0 0%,#ffffff 55%,#e8f0fb 100%)}
.heart{position:absolute;width:340px;height:340px;left:-90px;bottom:-150px;opacity:.06;transform:rotate(-12deg)}
.l{position:absolute;left:64px;top:70px;width:520px}
.brand{display:block;width:360px;height:auto}
h1{margin-top:34px;font-weight:800;font-size:54px;line-height:1.05;letter-spacing:-1px}
h1 .a{color:${NAVY};display:block}h1 .c{color:${GREEN};display:block}
p{margin-top:18px;font-size:22px;color:${NAVY}}
.ph{position:absolute;width:250px;padding:9px;border-radius:40px;background:linear-gradient(145deg,#3a4049,#14171b 40%,#2b3037);box-shadow:0 30px 60px rgba(15,42,92,.3)}
.ph div{border-radius:31px;overflow:hidden;background:#fff}.ph img{display:block;width:100%}
</style></head><body>
<img class="heart" src="${MARK}">
<div class="l"><img class="brand" src="${LOGO}" alt="DocOnClick">
<h1><span class="a">Doctors & Nurses.</span><span class="c">Just a Click Away.</span></h1>
<p>Clinic · Video · Home visits — in English, हिंदी, मराठी</p></div>
<div class="ph" style="right:230px;top:60px;transform:rotate(-6deg)"><div><img src="${map}"></div></div>
<div class="ph" style="right:40px;top:40px;transform:rotate(5deg)"><div><img src="${shot}"></div></div>
</body></html>`;
}

(async () => {
  const which = process.argv[2] ?? "all";
  const browser = await chromium.launch();
  const render = async (html: string, w: number, h: number, out: string) => {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.setContent(html, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    // Shrink a headline line that would run into the edges.
    await p.evaluate(() => {
      const max = document.body.clientWidth * 0.86;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("h1 span"))) {
        el.style.whiteSpace = "nowrap"; el.style.display = "inline-block";
        let size = parseFloat(getComputedStyle(el).fontSize);
        while (el.getBoundingClientRect().width > max && size > 20) el.style.fontSize = `${(size -= 2)}px`;
        el.style.display = "block";
      }
      // Fit the device between the subtitle and the bottom margin; the
      // screenshot is cropped from the bottom if there isn't room.
      const dev = document.querySelector<HTMLElement>(".dev");
      const sub = document.querySelector<HTMLElement>(".sub");
      const img = document.querySelector<HTMLImageElement>(".scr img");
      if (dev && sub && img) {
        const H = document.body.clientHeight;
        const gap = H * 0.03;
        const bottom = parseFloat(getComputedStyle(dev).marginBottom);
        const room = H - bottom - (sub.getBoundingClientRect().bottom + gap);
        const over = dev.getBoundingClientRect().height - room;
        if (over > 0) {
          img.style.height = `${img.getBoundingClientRect().height - over}px`;
          img.style.objectFit = "cover"; img.style.objectPosition = "top";
        }
      }
    });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await p.screenshot({ path: out });
    await p.close();
    console.log(path.relative(ROOT, out));
  };
  for (const kind of ["phone", "tablet"] as const) {
    if (which !== "all" && which !== kind) continue;
    const [w, h] = kind === "phone" ? [1080, 1920] : [1600, 2560];
    for (const s of SLIDES) await render(page(kind, s), w, h, path.join(OUT, kind, `${s.file}.png`));
  }
  if (which === "all" || which === "feature") await render(feature(), 1024, 500, path.join(OUT, "feature-graphic-1024x500.png"));
  await browser.close();
})();
