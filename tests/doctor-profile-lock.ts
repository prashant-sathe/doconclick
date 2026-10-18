// Verified-profile locks + bank-details re-auth (BUG-TRACKER #21):
// PATCH /api/doctors/me turns a verified doctor's medRegNo / qualification /
// specialty edits into a re-verification request (live values unchanged
// until an admin approves via POST /api/admin/doctors/:id/change-request),
// and a bank-details change needs valid IFSC/account numbers plus the
// password, then pushes the doctor. Runs against a live dev server and the
// DB in .env, throwaway users only. Push checks need DEV_LOG (see
// tests/admin-doctor-status.ts).
//
//   DEV_LOG=/tmp/next-dev.log npm run test:doctor-profile-lock
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DEV_LOG = process.env.DEV_LOG;
const PASSWORD = "lock-test-pass";
const DAY = 24 * 60 * 60 * 1000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}
const pushAttempts = () => (DEV_LOG ? (fs.readFileSync(DEV_LOG, "utf8").match(/sendPushToUsers failed/g) ?? []).length : 0);
const settle = () => new Promise((r) => setTimeout(r, 900));

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const hash = await hashPassword(PASSWORD);
  const ids: string[] = [];
  let n = 0;
  const mkDoctor = async (profile: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const u = await prisma.user.create({
      data: {
        name: `Lock Doctor ${++n}`, mobile: `3${stamp}${n}`, role: "DOCTOR", password: hash,
        doctorProfile: {
          create: {
            trialEndsAt: new Date(Date.now() + 30 * DAY), specialty: "General Physician", qualification: "MBBS",
            medRegNo: `LOCK${stamp}${n}`, ...profile,
          },
        },
        pushTokens: { create: { token: `lock-${stamp}-${n}` } },
        ...extra,
      } as never,
    });
    ids.push(u.id);
    return u;
  };
  const admin = await prisma.user.create({ data: { name: "Lock Admin", mobile: `3${stamp}0`, role: "ADMIN" } });
  ids.push(admin.id);
  const pending = await mkDoctor({ status: "PENDING" });
  const verified = await mkDoctor({ status: "APPROVED", isVerified: true });
  const other = await mkDoctor({ status: "APPROVED", isVerified: true });
  const google = await mkDoctor({ status: "APPROVED" }, { password: "" });
  const limited = await mkDoctor({ status: "APPROVED" });

  const cookieFor = (u: { id: string; name: string; role: string; mobile: string }) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
  const call = async (as: { id: string; name: string; role: string; mobile: string }, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookieFor(as), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const patch = (as: typeof verified, body: unknown) => call(as, "PATCH", "/api/doctors/me", body);
  const review = (doctorId: string, body: unknown) => call(admin, "POST", `/api/admin/doctors/${doctorId}/change-request`, body);
  const live = (id: string) => prisma.doctorProfile.findUniqueOrThrow({ where: { userId: id } });
  const pendingRequest = (id: string) => prisma.doctorChangeRequest.findFirst({ where: { doctorId: id, status: "PENDING" } });
  type Changes = Record<string, { from: string | null; to: string | null }>;

  try {
    // ── Before approval: free edits ──
    let r = await patch(pending, { specialty: "Cardiologist", qualification: "MBBS, MD", medRegNo: `LOCK${stamp}x` });
    let p = await live(pending.id);
    check("unapproved doctor edits freely", r.status === 200 && p.specialty === "Cardiologist" && p.medRegNo === `LOCK${stamp}x` && !(await pendingRequest(pending.id)),
      `${r.status} ${p.specialty}`);

    // ── Verified: edits become a request ──
    r = await patch(verified, { specialty: "Cardiologist", qualification: "MBBS", medRegNo: `LOCK${stamp}2`, bio: "New bio" });
    p = await live(verified.id);
    let req = await pendingRequest(verified.id);
    check("verified change → request, live value kept", r.status === 200 && p.specialty === "General Physician" && p.bio === "New bio"
      && (req?.changes as Changes)?.specialty?.to === "Cardiologist" && Object.keys(req?.changes as object).length === 1,
      `${r.status} live ${p.specialty}, request ${JSON.stringify(req?.changes)}`);
    check("response carries the request", r.json.changeRequest?.status === "PENDING", `${r.json.changeRequest?.status}`);

    r = await patch(verified, { specialty: "Cardiologist", qualification: "MBBS, MD", medRegNo: `LOCK${stamp}2` });
    req = await pendingRequest(verified.id);
    const reqs = await prisma.doctorChangeRequest.count({ where: { doctorId: verified.id } });
    check("further edit merges into the one pending request", reqs === 1 && (req?.changes as Changes)?.qualification?.to === "MBBS, MD"
      && (req?.changes as Changes)?.specialty?.to === "Cardiologist", JSON.stringify(req?.changes));

    r = await patch(verified, { specialty: "General Physician" });
    req = await pendingRequest(verified.id);
    check("setting a field back drops it from the request", !(req?.changes as Changes)?.specialty && !!(req?.changes as Changes)?.qualification,
      JSON.stringify(req?.changes));

    r = await patch(verified, { medRegNo: "" });
    check("can't remove a verified reg number", r.status === 400, `${r.status} ${r.json.error}`);
    r = await patch(verified, { medRegNo: `LOCK${stamp}3` });
    check("reg number taken by another doctor → 409", r.status === 409, `${r.status} ${r.json.error}`);
    const me = await call(verified, "GET", "/api/doctors/me");
    check("GET /api/doctors/me shows the pending request", me.json.changeRequest?.status === "PENDING", `${me.json.changeRequest?.status}`);

    // ── Admin review ──
    r = await review(verified.id, { action: "REJECT" });
    check("reject needs a reason", r.status === 400, `${r.status}`);
    let before = pushAttempts();
    r = await review(verified.id, { action: "REJECT", note: "Upload the new degree certificate first" });
    await settle();
    p = await live(verified.id);
    check("rejected: live profile unchanged", r.status === 200 && r.json.status === "REJECTED" && p.qualification === "MBBS", `${r.status} ${p.qualification}`);
    if (DEV_LOG) check("rejection pushed to the doctor", pushAttempts() - before === 1, `${pushAttempts() - before}`);
    r = await review(verified.id, { action: "APPROVE" });
    check("nothing pending → 404", r.status === 404, `${r.status}`);

    await patch(verified, { specialty: "Dermatologist", qualification: "MBBS, MD", medRegNo: `LOCK${stamp}new` });
    before = pushAttempts();
    const both = await Promise.all([review(verified.id, { action: "APPROVE" }), review(verified.id, { action: "APPROVE" })]);
    await settle();
    p = await live(verified.id);
    check("approve applies the change, once", both.filter((x) => x.status === 200).length === 1 && p.specialty === "Dermatologist"
      && p.qualification === "MBBS, MD" && p.medRegNo === `LOCK${stamp}new`, `${both.map((x) => x.status).join(",")} → ${p.specialty}, ${p.medRegNo}`);
    if (DEV_LOG) check("approval pushed once", pushAttempts() - before === 1, `${pushAttempts() - before}`);

    // Withdraw: a request whose fields all go back to the live values.
    await patch(verified, { specialty: "Pediatrician" });
    await patch(verified, { specialty: "Dermatologist" });
    const withdrawn = await prisma.doctorChangeRequest.findFirst({ where: { doctorId: verified.id }, orderBy: { createdAt: "desc" } });
    check("reverting everything withdraws the request", withdrawn?.status === "WITHDRAWN" && !(await pendingRequest(verified.id)), `${withdrawn?.status}`);

    // ── Bank details ──
    const bank = { bankName: "HDFC Bank", accountNumber: "50100123456789", accountNumberConfirm: "50100123456789", ifsc: "HDFC0001234" };
    r = await patch(verified, { bankDetails: "Evil | 1 | IFSC: X" });
    check("raw bankDetails write refused", r.status === 400, `${r.status}`);
    r = await patch(verified, { bank });
    check("bank change needs the password", r.status === 400 && r.json.code === "PASSWORD_REQUIRED", `${r.status}`);
    r = await patch(verified, { bank, currentPassword: "wrong" });
    check("wrong password refused", r.status === 400 && r.json.code === "WRONG_PASSWORD", `${r.status}`);
    for (const [label, b] of [
      ["bad IFSC", { ...bank, ifsc: "HDFC1234" }],
      ["IFSC 5th char not 0", { ...bank, ifsc: "HDFC1001234" }],
      ["short account", { ...bank, accountNumber: "1234", accountNumberConfirm: "1234" }],
      ["mismatched confirm", { ...bank, accountNumberConfirm: "50100123456780" }],
      ["no bank name", { ...bank, bankName: "" }],
    ] as const) {
      r = await patch(verified, { bank: b, currentPassword: PASSWORD });
      check(`rejects ${label}`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    check("nothing saved by the rejected attempts", (await live(verified.id)).bankDetails === null, "still null");

    before = pushAttempts();
    r = await patch(verified, { bank: { ...bank, ifsc: "hdfc0001234", accountNumber: "5010 0123 456789" }, currentPassword: PASSWORD });
    await settle();
    p = await live(verified.id);
    check("valid change saved in the stored format", r.status === 200 && p.bankDetails === "HDFC Bank | 50100123456789 | IFSC: HDFC0001234" && !!p.bankDetailsUpdatedAt,
      `${r.status} ${p.bankDetails}`);
    if (DEV_LOG) check("doctor notified of the bank change", pushAttempts() - before === 1, `${pushAttempts() - before}`);
    before = pushAttempts();
    r = await patch(verified, { bank, bio: "same bank" });
    await settle();
    check("re-sending the same bank needs no password, no notice", r.status === 200 && (DEV_LOG ? pushAttempts() - before === 0 : true), `${r.status}`);

    r = await patch(google, { bank, currentPassword: "anything" });
    check("account without a password must set one first", r.status === 403 && r.json.code === "REVERIFY_REQUIRED", `${r.status}`);
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await patch(limited, { bank, currentPassword: "nope" })).status);
    check("password guesses are rate-limited", codes.slice(0, 5).every((c) => c === 400) && codes[5] === 429, codes.join(","));
    void other;
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
