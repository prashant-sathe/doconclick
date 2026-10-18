// API status codes: 401 = no session, 403 = signed in with the wrong role,
// 400 = body that isn't a JSON object, 404/500 rather than a fake "session
// expired" 401 when a DB write fails. Against a live dev server and the DB
// in .env, throwaway users only.
//
//   npm run test:route-errors
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type User = { id: string; name: string; mobile: string; role: string };
const cookieFor = (u: User) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;

/** Sends `body` as-is when it's a string (to test malformed JSON), else JSON-encoded. */
async function call(user: User | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(user ? { Cookie: cookieFor(user) } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, error: (json as { error?: string }).error ?? "" };
}

async function expectStatus(label: string, user: User | null, method: string, path: string, body: unknown, status: number) {
  const r = await call(user, method, path, body);
  check(label, r.status === status, `${r.status} ${r.error}`);
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const patient = await prisma.user.create({
    data: { name: "Errors Patient", mobile: `2${stamp}1`, role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } },
  });
  // No PatientProfile: a profile write must 404, not claim the session expired.
  const bare = await prisma.user.create({ data: { name: "Errors Bare", mobile: `2${stamp}2`, role: "PATIENT" } });
  const doctor = await prisma.user.create({
    data: {
      name: "Errors Doctor", mobile: `2${stamp}3`, role: "DOCTOR",
      doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 864e5) } },
    },
  });
  const admin = await prisma.user.create({ data: { name: "Errors Admin", mobile: `2${stamp}4`, role: "ADMIN" } });
  const BAD_JSON = "{not json";

  try {
    // ── 401: no session ──
    await expectStatus("no session: patients/me", null, "PATCH", "/api/patients/me", {}, 401);
    await expectStatus("no session: wallet/pay", null, "POST", "/api/wallet/pay", {}, 401);
    await expectStatus("no session: admin complaints", null, "GET", "/api/admin/complaints", undefined, 401);

    // ── 403: wrong role ──
    await expectStatus("doctor → patients/me", doctor, "PATCH", "/api/patients/me", {}, 403);
    await expectStatus("doctor → dependents", doctor, "POST", "/api/patients/me/dependents", {}, 403);
    await expectStatus("doctor → dependent PATCH", doctor, "PATCH", "/api/patients/me/dependents/x", {}, 403);
    await expectStatus("doctor → wallet/pay", doctor, "POST", "/api/wallet/pay", {}, 403);
    await expectStatus("doctor → patient complaints", doctor, "POST", "/api/patient/complaints", {}, 403);
    await expectStatus("patient → doctors/me", patient, "PATCH", "/api/doctors/me", {}, 403);
    await expectStatus("patient → travel", patient, "PATCH", "/api/appointments/x/travel", {}, 403);
    await expectStatus("patient → doctor complaints", patient, "GET", "/api/doctor/complaints", undefined, 403);
    await expectStatus("patient → admin complaints", patient, "PATCH", "/api/admin/complaints", {}, 403);

    // ── 400: malformed / non-object JSON ──
    await expectStatus("bad JSON: patients/me", patient, "PATCH", "/api/patients/me", BAD_JSON, 400);
    await expectStatus("JSON array: patients/me", patient, "PATCH", "/api/patients/me", "[]", 400);
    await expectStatus("bad JSON: dependents", patient, "POST", "/api/patients/me/dependents", BAD_JSON, 400);
    await expectStatus("bad JSON: doctors/me", doctor, "PATCH", "/api/doctors/me", BAD_JSON, 400);
    await expectStatus("JSON null: doctors/me", doctor, "PATCH", "/api/doctors/me", "null", 400);
    await expectStatus("bad JSON: wallet/pay", patient, "POST", "/api/wallet/pay", BAD_JSON, 400);
    await expectStatus("non-string id: wallet/pay", patient, "POST", "/api/wallet/pay", { appointmentId: { not: "x" } }, 400);
    await expectStatus("bad JSON: patient complaints", patient, "POST", "/api/patient/complaints", BAD_JSON, 400);
    await expectStatus("bad JSON: admin complaints", admin, "PATCH", "/api/admin/complaints", BAD_JSON, 400);
    await expectStatus("bad status: admin complaints", admin, "PATCH", "/api/admin/complaints", { id: "x", status: "DELETED" }, 400);

    // ── DB failures aren't "session expired" ──
    await expectStatus("unknown complaint id → 404", admin, "PATCH", "/api/admin/complaints", { id: "nope", status: "RESOLVED" }, 404);
    await expectStatus("no profile → 404", bare, "PATCH", "/api/patients/me", { landmark: "x" }, 404);
    await expectStatus("happy path still 200", patient, "PATCH", "/api/patients/me", { landmark: "Near the temple" }, 200);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [patient.id, bare.id, doctor.id, admin.id] } } });
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
