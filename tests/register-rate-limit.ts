// P3-25: the nurse/doctor/patient register routes limit signups per IP
// (nurse + doctor 5, patient 10 per 10 min). The 6th nurse POST in the window
// answers 429 (localized) and creates no user. Runs against its OWN dev server
// (own port + distDir, so the owner's in-memory limiter is untouched) with
// Firebase credentials blanked, so no real push goes to admins.
//
//   npm run test:register-rate-limit
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { startDevServer } from "./devServer";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const { child, base } = await startDevServer({ env: { FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" }, label: "reg-rate" });
  const stamp = String(Date.now()).slice(-8);
  const mobiles: string[] = [];
  const post = async (path: string, body: object, lang?: string) => {
    const r = await fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": "10.9.9.9", ...(lang ? { cookie: `doconclick_lang=${lang}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  try {
    const nurse = (i: number) => { const m = `7${stamp}${i}`.slice(0, 10); mobiles.push(m); return { name: "Rate Test Nurse", mobile: m, password: "Test@12345" }; };
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await post("/api/nurses/register", nurse(i))).status);
    check("first 5 nurse signups allowed", codes.every((c) => c !== 429), codes.join(","));
    const sixth = await post("/api/nurses/register", nurse(5), "mr-IN");
    check("6th nurse signup -> 429", sixth.status === 429, String(sixth.status));
    check("429 message localized (mr)", /[ऀ-ॿ]/.test(String(sixth.body.error)), String(sixth.body.error));
    const created = await prisma.user.count({ where: { mobile: { in: mobiles } } });
    check("no user created by the blocked request", created <= 5 && !(await prisma.user.findUnique({ where: { mobile: mobiles[5] } })), `${created} users`);
    // Another IP is unaffected; doctor route has its own bucket.
    const dr = await post("/api/doctors/register", { name: "Rate Test Doctor", mobile: (() => { const m = `8${stamp}0`.slice(0, 10); mobiles.push(m); return m; })(), password: "Test@12345" });
    check("doctor route has its own bucket", dr.status !== 429, String(dr.status));
    let last = 0;
    for (let i = 0; i < 11; i++) { const m = `6${stamp}${i}`.slice(0, 10); mobiles.push(m); last = (await post("/api/patients/register", { mobile: m, password: "Test@12345" })).status; }
    check("11th patient signup -> 429", last === 429, String(last));
  } finally {
    child.kill();
    const users = await prisma.user.findMany({ where: { mobile: { in: mobiles } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    // Admin inbox rows written by the allowed signups (push itself is off).
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { body: { startsWith: "Rate Test " } }] } }).catch(() => {});
    await prisma.nurseProfile.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.doctorProfile.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.patientProfile.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch((e) => console.log("cleanup:", e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
