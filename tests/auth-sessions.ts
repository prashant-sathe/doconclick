// Session revocation + auth hardening checks (BUG-TRACKER #10). Runs against
// a live dev server (npm run dev) and the DB in .env, using throwaway users
// (incl. two throwaway admins) that are deleted afterwards — no push tokens,
// never a real account. Restart the dev server before re-running: the login
// lockout and IP limits are held in its memory.
//
//   npm run test:auth            (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const PASSWORD = "OldPass@123";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string; tokenVersion: number };
const tokenFor = (u: U, opts: { legacy?: boolean } = {}) =>
  jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, ...(opts.legacy ? {} : { tv: u.tokenVersion }) }, SECRET);
const cookie = (token: string) => `doconclick_token=${token}`;
const tokenFromSetCookie = (r: Response) => /doconclick_token=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1] ?? "";

const me = async (token: string) => (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie(token) } })).status;
const call = async (path: string, method: string, token: string | null, body?: unknown, extraCookie = "") => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: [token ? cookie(token) : "", extraCookie].filter(Boolean).join("; ") },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  return { r, status: r.status, json: await r.json().catch(() => ({})) as Record<string, string> };
};
const login = (mobile: string, password: string) => call("/api/auth/login", "POST", null, { mobile, password });

async function main() {
  const stamp = String(Date.now()).slice(-9);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const mk = (name: string, mobile: string, role: string, password = hash) =>
    prisma.user.create({ data: { name, mobile, role, password } });

  const patient = await mk("Auth Test Patient", "6" + stamp, "PATIENT");
  const lockout = await mk("Auth Test Lockout", "7" + stamp, "PATIENT");
  const pending = await mk("Auth Test Pending", `pending_authtest_${stamp}`, "PATIENT", "");
  const googleOnly = await mk("Auth Test Google", "8" + stamp, "PATIENT", "");
  const doctor = await prisma.user.create({ data: { name: "Auth Test Doctor", mobile: "9" + stamp, role: "DOCTOR", password: hash, doctorProfile: { create: { status: "APPROVED" } } } });
  const victim = await mk("Auth Test Victim", "5" + stamp, "PATIENT");
  const admin = await mk("Auth Test Admin", "4" + stamp, "ADMIN");
  const admin2 = await mk("Auth Test Admin 2", "3" + stamp, "ADMIN");
  const ids = [patient, lockout, pending, googleOnly, doctor, victim, admin, admin2].map((u) => u.id);

  try {
    // ── Legacy tokens (no tv claim) keep working after deploy ──
    const legacy = tokenFor(patient, { legacy: true });
    check("legacy token without tv", (await me(legacy)) === 200, "accepted as version 0");

    // ── Password change ──
    const l1 = await login(patient.mobile, PASSWORD);
    const l2 = await login(patient.mobile, PASSWORD);
    const c1 = tokenFromSetCookie(l1.r), c2 = tokenFromSetCookie(l2.r);
    check("login issues sessions", l1.status === 200 && !!c1 && !!c2, `${l1.status}/${l2.status}`);

    let res = await call("/api/auth/password", "PATCH", c1, { password: "NewPass@456" });
    check("password change needs current password", res.status === 400 && res.json.code === "CURRENT_PASSWORD_REQUIRED", `${res.status} ${res.json.code}`);
    res = await call("/api/auth/password", "PATCH", c1, { currentPassword: "nope-nope", password: "NewPass@456" });
    check("wrong current password rejected", res.status === 400 && res.json.code === "WRONG_PASSWORD", `${res.status} ${res.json.code}`);
    res = await call("/api/auth/password", "PATCH", c1, { currentPassword: PASSWORD, password: "NewPass@456" });
    const c1b = tokenFromSetCookie(res.r);
    check("password change succeeds", res.status === 200 && !!c1b, `${res.status}`);
    check("…changing device stays signed in", (await me(c1b)) === 200, "fresh cookie works");
    check("…other device signed out", (await me(c2)) === 401, `old session → ${await me(c2)}`);
    check("…legacy token signed out", (await me(legacy)) === 401, "revoked");
    check("…new password logs in", (await login(patient.mobile, "NewPass@456")).status === 200, "ok");

    // ── Logout all devices ──
    res = await call("/api/auth/logout-all", "POST", c1b);
    check("logout-all", res.status === 200 && (await me(c1b)) === 401, `${res.status}, session → ${await me(c1b)}`);

    // ── Proxy: a revoked session gets /login, not a page shell ──
    res = await call("/patient/dashboard", "GET", c1b);
    check("proxy redirects revoked session", res.status === 307 && (res.r.headers.get("location") ?? "").includes("/login"), `${res.status} → ${res.r.headers.get("location")}`);

    // ── Login lockout per mobile ──
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await login(lockout.mobile, "wrong-" + i)).status);
    const sixth = await login(lockout.mobile, PASSWORD);
    check("5 wrong passwords → 401", statuses.every((s) => s === 401), statuses.join(","));
    check("…6th attempt locked even with the right password", sixth.status === 429, `${sixth.status}`);

    // ── /api/auth/mobile only replaces a pending_ placeholder ──
    res = await call("/api/auth/mobile", "PATCH", tokenFor(victim), { mobile: "9" + String(Number(stamp) + 1).slice(-9) });
    check("mobile change refused for a real number", res.status === 403, `${res.status}`);
    const pendingNew = "9" + String(Number(stamp) + 2).slice(-9);
    res = await call("/api/auth/mobile", "PATCH", tokenFor(pending), { mobile: pendingNew });
    check("pending_ placeholder can be replaced", res.status === 200, `${res.status}`);
    res = await call("/api/auth/mobile", "PATCH", tokenFromSetCookie(res.r) || tokenFor(pending), { mobile: "9" + String(Number(stamp) + 3).slice(-9) });
    check("…but only once", res.status === 403, `${res.status}`);

    // ── Google-only account: password only via the reset proof ──
    const g = tokenFor(googleOnly);
    res = await call("/api/auth/password", "PATCH", g, { password: "Fresh@789" });
    check("no-password account needs Google re-verify", res.status === 403 && res.json.code === "REVERIFY_REQUIRED", `${res.status} ${res.json.code}`);
    const proof = jwt.sign({ id: googleOnly.id, tv: googleOnly.tokenVersion, purpose: "pwreset" }, SECRET, { expiresIn: 900 });
    check("reset proof is not a session", (await me(proof)) === 401, "rejected as session cookie");
    res = await call("/api/auth/password", "PATCH", g, { password: "Fresh@789" }, `doconclick_pwreset=${proof}`);
    const g2 = tokenFromSetCookie(res.r);
    check("reset proof sets the password", res.status === 200, `${res.status}`);
    res = await call("/api/auth/password", "PATCH", g2, { password: "Again@789" }, `doconclick_pwreset=${proof}`);
    check("…and works only once", res.status === 400 && res.json.code === "CURRENT_PASSWORD_REQUIRED", `${res.status} ${res.json.code}`);

    // ── Admin actions revoke the target's sessions ──
    const adminTok = tokenFor(admin);
    const doctorTok = tokenFor(doctor);
    check("doctor session before suspend", (await me(doctorTok)) === 200, "ok");
    res = await call(`/api/admin/doctors/${doctor.id}`, "PATCH", adminTok, { status: "SUSPENDED" });
    check("suspend revokes sessions", res.status === 200 && (await me(doctorTok)) === 401, `${res.status}, session → ${await me(doctorTok)}`);
    check("…suspended doctor can still log in", (await login(doctor.mobile, PASSWORD)).status === 200, "sees the suspended notice");

    const victimTok = tokenFor(victim);
    res = await call(`/api/admin/patients/${victim.id}`, "DELETE", adminTok);
    check("deleted user signed out", res.status === 200 && (await me(victimTok)) === 401, `${res.status}, session → ${await me(victimTok)}`);

    const admin2Tok = tokenFor(admin2);
    check("admin 2 session before removal", (await call("/api/admin/settings", "GET", admin2Tok)).status === 200, "ok");
    res = await call(`/api/admin/admins/${admin2.id}`, "DELETE", adminTok);
    const after = await call("/api/admin/settings", "GET", admin2Tok);
    check("removed admin loses access", res.status === 200 && after.status === 403, `${res.status}, admin API → ${after.status}`);
  } finally {
    await prisma.doctorProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: ids } } });
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
