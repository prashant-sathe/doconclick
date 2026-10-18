// Admin doctor approve / reject / suspend (PATCH /api/admin/doctors/:id):
// approval needs reg no + certificate + KYC + the paid registration fee,
// rejection needs a reason, and a push goes out only on an actual change.
// Runs against a live dev server and the DB in .env, using only throwaway
// users that are removed afterwards.
//
// Push checks count "sendPushToUsers failed" lines in the dev server's log,
// so start the server with Firebase blanked (nothing reaches real FCM) and
// point DEV_LOG at its output; without DEV_LOG they're skipped:
//
//   FIREBASE_PROJECT_ID= npx next dev > /tmp/next-dev.log 2>&1 &
//   DEV_LOG=/tmp/next-dev.log npm run test:admin-doctor-status
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DEV_LOG = process.env.DEV_LOG;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

const pushAttempts = () => (DEV_LOG ? (fs.readFileSync(DEV_LOG, "utf8").match(/sendPushToUsers failed/g) ?? []).length : 0);
const settle = () => new Promise((r) => setTimeout(r, 800));

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const admin = await prisma.user.create({ data: { name: "Status Test Admin", mobile: `4${stamp}1`, role: "ADMIN" } });
  const complete = { medRegNo: `STATUSREG${stamp}`, medRegCertUrl: "https://x/cert.pdf", kycDocUrl: "https://x/kyc.pdf", registrationFeePaid: true };
  const mkDoctor = (n: number, profile: Record<string, unknown>) =>
    prisma.user.create({
      data: {
        name: `Status Test Doctor ${n}`, mobile: `9${stamp}${n}`, role: "DOCTOR",
        doctorProfile: { create: { status: "PENDING", ...profile } as never },
        pushTokens: { create: { token: `status-test-${stamp}-${n}` } },
      },
    });
  const docs = await Promise.all([
    mkDoctor(1, { ...complete, medRegNo: `STATUSREG${stamp}a`, medRegCertUrl: null }),
    mkDoctor(2, { ...complete, medRegNo: null }),
    mkDoctor(3, { ...complete, medRegNo: `STATUSREG${stamp}c`, kycDocUrl: null }),
    mkDoctor(4, { ...complete, medRegNo: `STATUSREG${stamp}d`, registrationFeePaid: false }),
    mkDoctor(5, complete),
  ]);
  const [noCert, noReg, noKyc, unpaid, ok] = docs;
  const ids = [admin.id, ...docs.map((d) => d.id)];

  const cookie = `doconclick_token=${jwt.sign({ id: admin.id, name: admin.name, role: "ADMIN", mobile: admin.mobile, tv: 0 }, SECRET)}`;
  const patch = async (id: string, body: unknown) => {
    const res = await fetch(`${BASE}/api/admin/doctors/${id}`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const statusOf = async (id: string) => (await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: id } })).status;
  // Runs `fn`, then reports how many pushes it triggered (-1 = not measured).
  const pushes = async (fn: () => Promise<unknown>) => {
    const before = pushAttempts();
    await fn();
    await settle();
    return DEV_LOG ? pushAttempts() - before : -1;
  };
  const pushCheck = (label: string, n: number, want: number) => {
    if (n === -1) console.log(`SKIP  ${label} — DEV_LOG not set`);
    else check(label, n === want, `${n} push(es)`);
  };

  try {
    // ── Approval prerequisites ──
    for (const [label, d, needle] of [
      ["no certificate", noCert, "registration certificate"],
      ["no reg number", noReg, "registration number"],
      ["no KYC", noKyc, "government ID"],
      ["fee unpaid", unpaid, "registration fee"],
    ] as const) {
      let r!: Awaited<ReturnType<typeof patch>>;
      const n = await pushes(async () => { r = await patch(d.id, { status: "APPROVED" }); });
      check(`approve blocked: ${label}`, r.status === 400 && String(r.json.error).includes(needle) && (await statusOf(d.id)) === "PENDING", `${r.status} ${r.json.error}`);
      pushCheck(`no push when blocked: ${label}`, n, 0);
    }

    let r!: Awaited<ReturnType<typeof patch>>;
    let n = await pushes(async () => { r = await patch(ok.id, { status: "APPROVED" }); });
    check("approve complete doctor", r.status === 200 && (await statusOf(ok.id)) === "APPROVED", `${r.status}`);
    pushCheck("approval pushed once", n, 1);

    n = await pushes(async () => { r = await patch(ok.id, { status: "APPROVED" }); });
    check("re-approve is a no-op", r.status === 200, `${r.status}`);
    pushCheck("no push for unchanged status", n, 0);

    // ── Rejection reason ──
    r = await patch(ok.id, { status: "REJECTED" });
    check("reject without reason", r.status === 400 && (await statusOf(ok.id)) === "APPROVED", `${r.status} ${r.json.error}`);
    r = await patch(ok.id, { status: "REJECTED", rejectionReason: "   " });
    check("reject with blank reason", r.status === 400, `${r.status}`);
    r = await patch(ok.id, { status: "REJECTED", rejectionReason: "x".repeat(501) });
    check("reject with over-long reason", r.status === 400, `${r.status}`);
    n = await pushes(async () => { r = await patch(ok.id, { status: "REJECTED", rejectionReason: "Certificate is unreadable" }); });
    check("reject with reason", r.status === 200 && (await statusOf(ok.id)) === "REJECTED", `${r.status}`);
    pushCheck("rejection pushed once", n, 1);
    n = await pushes(async () => { r = await patch(ok.id, { status: "REJECTED", rejectionReason: "again" }); });
    pushCheck("no push for repeated rejection", n, 0);

    // ── Suspend: change pushes + revokes, repeat doesn't ──
    await patch(ok.id, { status: "APPROVED" });
    await settle(); // let that change's own push land before measuring
    const tvBefore = (await prisma.user.findUniqueOrThrow({ where: { id: ok.id } })).tokenVersion;
    n = await pushes(async () => { r = await patch(ok.id, { status: "SUSPENDED" }); });
    const tvAfter = (await prisma.user.findUniqueOrThrow({ where: { id: ok.id } })).tokenVersion;
    check("suspend revokes sessions", r.status === 200 && tvAfter === tvBefore + 1, `tokenVersion ${tvBefore}→${tvAfter}`);
    pushCheck("suspension pushed once", n, 1);
    n = await pushes(async () => { r = await patch(ok.id, { status: "SUSPENDED" }); });
    const tvRepeat = (await prisma.user.findUniqueOrThrow({ where: { id: ok.id } })).tokenVersion;
    check("repeat suspend doesn't revoke again", tvRepeat === tvAfter, `tokenVersion ${tvRepeat}`);
    pushCheck("no push for repeated suspension", n, 0);

    // ── Concurrent changes: one wins, one push ──
    await patch(ok.id, { status: "APPROVED" });
    await settle(); // let that change's own push land before measuring
    let results: Awaited<ReturnType<typeof patch>>[] = [];
    n = await pushes(async () => {
      results = await Promise.all(Array.from({ length: 5 }, () => patch(ok.id, { status: "SUSPENDED" })));
    });
    const codes = results.map((x) => x.status);
    check("5 concurrent suspends → one change", codes.filter((c) => c === 200).length >= 1 && codes.every((c) => c === 200 || c === 409), codes.join(","));
    pushCheck("concurrent suspends pushed once", n, 1);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
