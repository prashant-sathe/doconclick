// Setting off for an unpaid home visit (BUG-TRACKER F6): "Start journey" on a
// nurse (or doctor) visit the patient hasn't paid for online is refused with
// 409 UNPAID_VISIT until the provider confirms they're going anyway, and the
// patient is pushed a pay reminder — at most once per 10 minutes per visit,
// whether from setting off or the "Remind" button. Paid and cash visits start
// as before. Against a live dev server and the DB in .env, throwaway users
// only. Push counts read the dev server's log (DEV_LOG).
//
//   DEV_LOG=/path/to/dev.log npm run test:unpaid-journey   (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DEV_LOG = process.env.DEV_LOG ?? "/tmp/doconclick-dev.log";
const HOUR = 3600e3, DAY = 24 * HOUR;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}
const hasLog = fs.existsSync(DEV_LOG);
const pushesTo = (userId: string) => (hasLog ? fs.readFileSync(DEV_LOG, "utf8").split(`sendPushToUsers(${userId}):`).length - 1 : 0);
const settle = () => new Promise((r) => setTimeout(r, 2000));

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}

async function main() {
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  const packageIds: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `5${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const nurse = await mk({ name: "Unpaid Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED", isVerified: true } } });
  const otherNurse = await mk({ name: "Other Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED", isVerified: true } } });
  const doctor = await mk({ name: "Unpaid Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), offersHomeVisit: true } } });
  const desk = await mk({ name: "Unpaid Desk", role: "STAFF" });
  await prisma.staffProfile.create({ data: { userId: desk.id, doctorId: doctor.id } });
  const patient = await mk({ name: "Unpaid Patient", role: "PATIENT", password: "x", patientProfile: { create: { age: 30, gender: "Male" } } });
  await prisma.pushToken.create({ data: { userId: patient.id, token: `test-unpaid-${stamp}` } });

  const visit = (providerId: string, extra: Record<string, unknown> = {}) => prisma.appointment.create({
    data: {
      doctorId: providerId, patientId: patient.id, status: "SCHEDULED", consultType: "HOME", symptoms: "UNPAID-JOURNEY", amount: 600,
      paymentMethod: "ONLINE", paymentStatus: "PENDING", scheduledAt: new Date(Date.now() + HOUR), createdAt: new Date(Date.now() - DAY),
      acceptedAt: new Date(Date.now() - DAY + HOUR), providerType: providerId === doctor.id ? "DOCTOR" : "NURSE", serviceName: providerId === doctor.id ? null : "Injection",
      ...extra,
    } as never,
  });
  const start = (u: U, id: string, extra: Record<string, unknown> = {}) =>
    call(u, "PATCH", `/api/appointments/${id}/travel`, { travelStatus: "ON_THE_WAY", lat: 18.5, lng: 73.8, ...extra });
  const row = (id: string) => prisma.appointment.findUniqueOrThrow({ where: { id } });

  try {
    if (!hasLog) console.log(`(push counts skipped — no dev log at ${DEV_LOG})`);
    // ── Refused until confirmed; the patient is reminded ──
    const v = await visit(nurse.id, { discountAmount: 100 });
    let before = pushesTo(patient.id);
    let r = await start(nurse, v.id);
    await settle();
    check("unpaid nurse visit: start → 409 UNPAID_VISIT with what's due (after coupon)", r.status === 409 && r.json.code === "UNPAID_VISIT" && r.json.amount === 500, `${r.status} ${r.json.code} ₹${r.json.amount}`);
    check("…patient reminded (reminderSent, payReminderSentAt set)", r.json.reminderSent === true && !!(await row(v.id)).payReminderSentAt, `${r.json.reminderSent}`);
    if (hasLog) check("…one pay-reminder push", pushesTo(patient.id) - before === 1, `${pushesTo(patient.id) - before} pushes`);
    check("…journey not started, no position stored", (await row(v.id)).travelStatus === "NOT_STARTED" && (await row(v.id)).doctorLat === null, (await row(v.id)).travelStatus);

    before = pushesTo(patient.id);
    r = await start(nurse, v.id);
    await settle();
    check("trying again within 10 min → still 409, not reminded twice", r.status === 409 && r.json.reminderSent === false && !!r.json.reminderSentAt, `${r.json.reminderSent}`);
    if (hasLog) check("…no second push", pushesTo(patient.id) - before === 0, `${pushesTo(patient.id) - before} pushes`);
    r = await call(nurse, "POST", `/api/appointments/${v.id}/pay-reminder`);
    check("\"Remind\" within the cooldown → 429, says when", r.status === 429 && r.json.code === "REMINDED_RECENTLY" && /in \d+ min/.test(String(r.json.error)), `${r.status} ${r.json.error}`);

    before = pushesTo(patient.id);
    r = await start(nurse, v.id, { acknowledgeUnpaid: true });
    await settle();
    check("going anyway (acknowledgeUnpaid) → 200, ON_THE_WAY", r.status === 200 && (await row(v.id)).travelStatus === "ON_THE_WAY", `${r.status} ${r.json.error ?? ""}`);
    if (hasLog) check("…patient gets the \"on the way\" push (reminder still in cooldown)", pushesTo(patient.id) - before === 1, `${pushesTo(patient.id) - before} pushes`);
    r = await call(nurse, "PATCH", `/api/appointments/${v.id}/travel`, { travelStatus: "ON_THE_WAY", lat: 18.51, lng: 73.81 });
    check("position updates while on the way aren't re-checked → 200", r.status === 200, `${r.status}`);
    r = await call(nurse, "PATCH", `/api/appointments/${v.id}/travel`, { travelStatus: "ARRIVED" });
    check("arriving → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    await settle(); // let the "arrived" push reach the log before the next count

    // ── Cooldown over → reminded again ──
    const v2 = await visit(nurse.id, { payReminderSentAt: new Date(Date.now() - 11 * 60_000) });
    before = pushesTo(patient.id);
    r = await start(nurse, v2.id);
    await settle();
    check("last reminder 11 min ago → reminded again", r.status === 409 && r.json.reminderSent === true, `${r.json.reminderSent}`);
    if (hasLog) check("…one push", pushesTo(patient.id) - before === 1, `${pushesTo(patient.id) - before}`);

    // ── Remind button ──
    const v3 = await visit(nurse.id);
    r = await call(nurse, "POST", `/api/appointments/${v3.id}/pay-reminder`);
    check("\"Remind\" → 200 with what's due", r.status === 200 && r.json.amount === 600 && !!r.json.reminderSentAt, `${r.status} ${r.json.error ?? ""}`);
    r = await start(nurse, v3.id);
    check("…then setting off within 10 min: refused, no extra reminder", r.status === 409 && r.json.reminderSent === false, `${r.json.reminderSent}`);
    r = await call(otherNurse, "POST", `/api/appointments/${v3.id}/pay-reminder`);
    check("another nurse can't remind → 404", r.status === 404, `${r.status}`);
    r = await call(patient, "POST", `/api/appointments/${v3.id}/pay-reminder`);
    check("patient can't → 403", r.status === 403, `${r.status}`);

    // ── Package: what's due is every unpaid accepted visit ──
    const svc = await prisma.nurseService.findFirstOrThrow({});
    const pkg = await prisma.nursePackage.create({ data: { patientId: patient.id, nurseId: nurse.id, serviceId: svc.id, visits: 3, intervalDays: 1 } });
    packageIds.push(pkg.id);
    const p1 = await visit(nurse.id, { packageId: pkg.id, packageIndex: 1 });
    await visit(nurse.id, { packageId: pkg.id, packageIndex: 2, scheduledAt: new Date(Date.now() + DAY) });
    await visit(nurse.id, { packageId: pkg.id, packageIndex: 3, scheduledAt: new Date(Date.now() + 2 * DAY), status: "CANCELLED" });
    r = await start(nurse, p1.id);
    check("package visit → due is the 2 accepted unpaid visits (₹1200)", r.status === 409 && r.json.amount === 1200, `₹${r.json.amount}`);

    // ── Paid / cash start as before ──
    const paid = await visit(nurse.id, { paymentStatus: "PAID", paidAt: new Date() });
    r = await start(nurse, paid.id);
    check("paid visit → starts straight away", r.status === 200 && !(await row(paid.id)).payReminderSentAt, `${r.status}`);
    const cash = await visit(doctor.id, { paymentMethod: "CASH" });
    r = await start(doctor, cash.id);
    check("doctor's cash home visit → starts straight away", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // ── Doctor home visit, and the front desk ──
    const dv = await visit(doctor.id);
    r = await start(doctor, dv.id);
    check("doctor's unpaid online home visit → 409 UNPAID_VISIT too", r.status === 409 && r.json.code === "UNPAID_VISIT", `${r.status} ${r.json.code}`);
    const dv2 = await visit(doctor.id);
    r = await call(desk, "POST", `/api/appointments/${dv2.id}/pay-reminder`);
    check("front desk can remind for their doctor's visit → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(nurse, "POST", `/api/appointments/${paid.id}/pay-reminder`);
    check("remind on a paid visit → 400", r.status === 400, `${r.status}`);

    for (const page of ["/nurse/dashboard"]) {
      const res = await fetch(`${BASE}${page}`, { headers: { Cookie: cookieFor(nurse) }, redirect: "manual" });
      check(`${page} renders`, res.status === 200, `${res.status}`);
    }
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.nursePackage.deleteMany({ where: { id: { in: packageIds } } });
    await prisma.staffProfile.deleteMany({ where: { OR: [{ userId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.pushToken.deleteMany({ where: { userId: { in: ids } } });
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
