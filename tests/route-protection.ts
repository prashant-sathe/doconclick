// Page protection in src/proxy.ts (BUG-TRACKER #51): every page under
// /patient and /doctor needs the right role — a signed-out visitor is sent to
// /login (with ?next=), a wrong role to their own home — except the register
// pages and a doctor's public profile. The page list is read from src/app, so
// a new page is covered automatically. Against a live dev server and the DB
// in .env, throwaway users only.
//
//   npm run test:route-protection
import "dotenv/config";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { ROLE_HOME } from "../src/lib/roleHome";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

/** Every page route under src/app/<area>, with [params] filled in. */
function pagesUnder(area: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "page.tsx") {
        const rel = path.relative("src/app", path.dirname(full)).split(path.sep).map((seg) => (seg.startsWith("[") ? "x1" : seg));
        out.push("/" + rel.join("/"));
      }
    }
  };
  walk(path.join("src/app", area));
  return out.sort();
}

const PUBLIC = new Set(["/patient/register", "/doctor/register", "/patient/doctor/x1"]);
const STAFF_OK = (p: string) => /^\/doctor\/(dashboard|chat|walk-in)(\/|$)/.test(p);

type U = { id: string; name: string; role: string; mobile: string; tokenVersion: number };
async function visit(p: string, as: U | null) {
  const headers: Record<string, string> = {};
  if (as) headers.Cookie = `doconclick_token=${jwt.sign({ id: as.id, name: as.name, role: as.role, mobile: as.mobile, tv: as.tokenVersion }, SECRET)}`;
  const res = await fetch(`${BASE}${p}`, { headers, redirect: "manual" });
  const loc = res.headers.get("location");
  return { status: res.status, location: loc ? new URL(loc, BASE).pathname + new URL(loc, BASE).search : null };
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (role: string, extra: Record<string, unknown> = {}) => {
    const u = await prisma.user.create({ data: { name: `Guard ${role}`, mobile: `3${stamp}${n++}`, role, termsAcceptedAt: new Date(), ...extra } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const patient = await mk("PATIENT", { patientProfile: { create: { age: 30, gender: "Male" } } });
  const doctor = await mk("DOCTOR", { doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * 864e5) } } });
  const staff = await mk("STAFF", { staffAccount: { create: { doctorId: doctor.id, active: true } } });
  const nurse = await mk("NURSE", { nurseProfile: { create: { status: "APPROVED" } } });
  const admin = await mk("ADMIN");
  const roles = { PATIENT: patient, DOCTOR: doctor, STAFF: staff, NURSE: nurse, ADMIN: admin } as const;

  const pages = [...pagesUnder("patient"), ...pagesUnder("doctor")];
  console.log(`(${pages.length} pages under /patient and /doctor)`);
  // Warm up compilation so the first real requests don't time out.
  for (const p of pages) await fetch(`${BASE}${p}`, { redirect: "manual" }).catch(() => null);

  try {
    // ── Signed out ──
    const outFail: string[] = [];
    for (const p of pages) {
      const r = await visit(p, null);
      const ok = PUBLIC.has(p)
        ? r.status === 200
        : r.status === 307 && r.location === `/login?next=${encodeURIComponent(p)}`;
      if (!ok) outFail.push(`${p} → ${r.status} ${r.location ?? ""}`);
    }
    check(`signed out: ${pages.length - [...PUBLIC].filter((p) => pages.includes(p)).length} protected pages → /login?next=…, ${[...PUBLIC].filter((p) => pages.includes(p)).length} public pages open`, outFail.length === 0, outFail.slice(0, 5).join(" | ") || "ok");
    const q = await visit("/patient/appointments?tab=past", null);
    check("…?next= keeps the query string", q.location === `/login?next=${encodeURIComponent("/patient/appointments?tab=past")}`, String(q.location));

    // ── Each role ──
    for (const [role, user] of Object.entries(roles)) {
      const bad: string[] = [];
      for (const p of pages) {
        const allowed = PUBLIC.has(p)
          || (p.startsWith("/patient") && role === "PATIENT")
          || (p.startsWith("/doctor") && role === "DOCTOR")
          || (role === "STAFF" && STAFF_OK(p));
        const r = await visit(p, user);
        // The register pages are let through for everyone (as before) — the page itself handles a signed-in visitor.
        const ok = allowed || p.endsWith("/register")
          ? r.status === 200
          : r.status === 307 && r.location === ROLE_HOME[role];
        if (!ok) bad.push(`${p} → ${r.status} ${r.location ?? ""}`);
      }
      check(`${role}: allowed pages open, the rest → ${ROLE_HOME[role]}`, bad.length === 0, bad.slice(0, 5).join(" | ") || "ok");
    }

    // ── Existing behaviour kept ──
    let r = await visit("/login", doctor);
    check("signed-in /login still → their home", r.status === 307 && r.location === "/doctor/dashboard", `${r.status} ${r.location}`);
    r = await visit("/nurse/dashboard", patient);
    check("/nurse still nurse-only", r.status === 307 && r.location === "/patient/dashboard", `${r.status} ${r.location}`);
    r = await visit("/admin", doctor);
    check("/admin still admin-only", r.status === 307 && r.location === "/doctor/dashboard", `${r.status} ${r.location}`);
    const google = await mk("PATIENT", { mobile: `pending_${stamp}`, patientProfile: { create: { age: 30, gender: "Male" } } });
    r = await visit("/patient/doctor/x1", google);
    check("a Google account without a mobile is still sent to /complete-profile, even on a public page", r.status === 307 && r.location === "/complete-profile", `${r.status} ${r.location}`);
    // Revoked the real way ("log out everywhere"), which also clears the
    // server's 30s session cache — a direct DB write would be served from it.
    const cookie = `doconclick_token=${jwt.sign({ id: patient.id, name: patient.name, role: "PATIENT", mobile: patient.mobile, tv: patient.tokenVersion }, SECRET)}`;
    const out = await fetch(`${BASE}/api/auth/logout-all`, { method: "POST", headers: { Cookie: cookie } });
    check("(log out everywhere → 200)", out.ok, `${out.status}`);
    r = await visit("/patient/wallet", patient);
    check("a revoked session (old tokenVersion) → /login", r.status === 307 && (r.location ?? "").startsWith("/login"), `${r.status} ${r.location}`);
  } finally {
    await prisma.staffProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
