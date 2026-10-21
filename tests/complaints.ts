// Admin complaint status updates (BUG-TRACKER #46): status validated against
// the allowed list, unknown ids are a 404 (never a 500), and the patient is
// pushed only when the status really changes. Against a live dev server and
// the DB in .env, throwaway users only.
//
// Push checks count the server's "sendPushToUsers(<id>): …" log lines, so run
// the dev server with its output in DEV_LOG (default /tmp/doconclick-dev.log).
// The patient gets a dummy push token — FCM rejects it, nothing is delivered.
//
//   npm run test:complaints
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DEV_LOG = process.env.DEV_LOG ?? "/tmp/doconclick-dev.log";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function patch(as: U, body: unknown) {
  const res = await fetch(`${BASE}/api/admin/complaints`, {
    method: "PATCH", headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; status?: string } };
}

const hasLog = fs.existsSync(DEV_LOG);
const pushesTo = (userId: string) => (hasLog ? fs.readFileSync(DEV_LOG, "utf8").split(`sendPushToUsers(${userId}):`).length - 1 : 0);
const settle = () => new Promise((r) => setTimeout(r, 2500)); // pushes are fire-and-forget

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  const mk = async (n: number, data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `1${stamp}${n}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const admin = await mk(1, { name: "Complaint Admin", role: "ADMIN" });
  const patient = await mk(2, { name: "Complaint Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  await prisma.pushToken.create({ data: { userId: patient.id, token: `test-complaint-${stamp}` } });
  const complaint = await prisma.complaint.create({ data: { userId: patient.id, subject: "Payment didn't go through", description: "Charged twice" } });

  try {
    // ── Validation ──
    let r = await patch(admin, { id: complaint.id, status: "DELETED" });
    check("unknown status → 400", r.status === 400 && r.json.error === "Invalid status", `${r.status} ${r.json.error}`);
    r = await patch(admin, { id: complaint.id, status: "resolved" });
    check("wrong case → 400 (the list is exact)", r.status === 400, `${r.status}`);
    r = await patch(admin, { id: complaint.id });
    check("missing status → 400", r.status === 400, `${r.status}`);
    r = await patch(admin, { status: "RESOLVED" });
    check("missing id → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await patch(admin, { id: { not: "a string" }, status: "RESOLVED" });
    check("non-string id → 400", r.status === 400, `${r.status}`);
    r = await patch(admin, "{not json");
    check("malformed JSON → 400", r.status === 400, `${r.status}`);
    r = await patch(admin, { id: "no-such-complaint", status: "RESOLVED" });
    check("unknown id → 404, not 500", r.status === 404 && r.json.error === "Complaint not found", `${r.status} ${r.json.error}`);
    r = await patch(patient, { id: complaint.id, status: "RESOLVED" });
    check("a patient can't change it (403)", r.status === 403, `${r.status}`);
    check("…nothing changed by any of those", (await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).status === "OPEN", "still OPEN");

    // ── Pushes only on real changes ──
    await settle();
    const base = pushesTo(patient.id);
    r = await patch(admin, { id: complaint.id, status: "OPEN" });
    await settle();
    check("setting the status it already has → 200, unchanged", r.status === 200 && r.json.status === "OPEN", `${r.status} ${r.json.status}`);
    if (hasLog) check("…no push", pushesTo(patient.id) === base, `${pushesTo(patient.id) - base} pushes`);

    r = await patch(admin, { id: complaint.id, status: "IN_PROGRESS" });
    await settle();
    check("OPEN → IN_PROGRESS → 200", r.status === 200 && r.json.status === "IN_PROGRESS", `${r.status} ${r.json.status}`);
    if (hasLog) check("…one push", pushesTo(patient.id) - base === 1, `${pushesTo(patient.id) - base} pushes`);

    r = await patch(admin, { id: complaint.id, status: "IN_PROGRESS" });
    await settle();
    if (hasLog) check("repeating it (double click) → still one push in total", pushesTo(patient.id) - base === 1, `${pushesTo(patient.id) - base} pushes`);

    // Two admins resolving at once: one update, one push.
    const before = pushesTo(patient.id);
    const both = await Promise.all([patch(admin, { id: complaint.id, status: "RESOLVED" }), patch(admin, { id: complaint.id, status: "RESOLVED" })]);
    await settle();
    check("two simultaneous RESOLVED requests → both 200", both.every((x) => x.status === 200 && x.json.status === "RESOLVED"), both.map((x) => x.status).join(", "));
    if (hasLog) check("…exactly one push for them", pushesTo(patient.id) - before === 1, `${pushesTo(patient.id) - before} pushes`);

    r = await patch(admin, { id: complaint.id, status: "OPEN" });
    await settle();
    check("reopening is a real change → 200", r.status === 200 && r.json.status === "OPEN", `${r.status} ${r.json.status}`);
    if (hasLog) check("…and pushes", pushesTo(patient.id) - before === 2, `${pushesTo(patient.id) - before} pushes`);
  } finally {
    await prisma.complaint.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  if (!hasLog) console.log(`(push checks skipped — no dev log at ${DEV_LOG})`);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
