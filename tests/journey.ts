// Home-visit journeys (BUG-TRACKER #40): "Start journey" only within ±3h of
// the visit (src/lib/journeyWindow.ts), "Stop journey" back to NOT_STARTED
// (clears the shared position, and the patient can reschedule again), and the
// patient pushed only when the status changes — not on every position update.
// Pure checks, then API checks against a live dev server and the DB in .env,
// throwaway users only.
//
// Push checks count the server's "sendPushToUsers(<id>): …" log lines, so run
// the dev server with its output in DEV_LOG (default /tmp/doconclick-dev.log).
// The patient gets a dummy push token — FCM rejects it, nothing is delivered.
//
//   npm run test:journey
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { journeyStartWindow, JOURNEY_START_WINDOW_HOURS } from "../src/lib/journeyWindow";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DEV_LOG = process.env.DEV_LOG ?? "/tmp/doconclick-dev.log";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const fromNow = (ms: number) => new Date(Date.now() + ms);

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(u: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Cookie: cookieFor(u), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string } };
}
const hasLog = fs.existsSync(DEV_LOG);
const pushesTo = (userId: string) => (hasLog ? fs.readFileSync(DEV_LOG, "utf8").split(`sendPushToUsers(${userId}):`).length - 1 : 0);
const settle = () => new Promise((r) => setTimeout(r, 2500));

async function main() {
  // ── The window ──
  const t = new Date(10 * DAY);
  const timed = journeyStartWindow({ scheduledAt: t, createdAt: new Date(0) });
  check(`timed visit: ±${JOURNEY_START_WINDOW_HOURS}h around scheduledAt`, timed.opensAt === t.getTime() - JOURNEY_START_WINDOW_HOURS * HOUR && timed.closesAt === t.getTime() + JOURNEY_START_WINDOW_HOURS * HOUR, "ok");
  const bookNow = journeyStartWindow({ scheduledAt: t, createdAt: t, acceptedAt: new Date(t.getTime() + 2 * HOUR) });
  check("book-now: anchored on acceptance", bookNow.opensAt === t.getTime() + 2 * HOUR - JOURNEY_START_WINDOW_HOURS * HOUR, "ok");

  // ── API ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `2${stamp}${n++}`, ...data } as never });
    ids.push(u.id);
    return u;
  };
  const doctor = await mk({
    name: "Journey Doctor", role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: fromNow(30 * DAY), offersHomeVisit: true, availability: "Sun-Sat, 12AM-11:59PM" } },
  });
  const nurse = await mk({ name: "Journey Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });
  const patient = await mk({ name: "Journey Patient", role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 30, gender: "Male" } } });
  await prisma.pushToken.create({ data: { userId: patient.id, token: `test-journey-${stamp}` } });

  const visit = (providerId: string, extra: Record<string, unknown>) => prisma.appointment.create({
    data: {
      doctorId: providerId, patientId: patient.id, status: "SCHEDULED", consultType: "HOME", symptoms: "fever", amount: 800,
      paymentMethod: "CASH", createdAt: fromNow(-DAY), acceptedAt: fromNow(-DAY + HOUR), ...extra,
    } as never,
  });
  const travel = (u: U, id: string, travelStatus: string, pos = true) =>
    call(u, "PATCH", `/api/appointments/${id}/travel`, { travelStatus, ...(pos ? { lat: 18.5, lng: 73.8 } : {}) });

  try {
    // ── Too early / too late ──
    const tomorrow = await visit(doctor.id, { scheduledAt: fromNow(DAY) });
    let r = await travel(doctor, tomorrow.id, "ON_THE_WAY");
    check("visit tomorrow: start journey → 400 JOURNEY_TOO_EARLY", r.status === 400 && r.json.code === "JOURNEY_TOO_EARLY", `${r.status} ${r.json.error}`);
    r = await travel(doctor, tomorrow.id, "ARRIVED", false);
    check("…marking arrived straight away is blocked too", r.status === 400 && r.json.code === "JOURNEY_TOO_EARLY", `${r.status}`);
    const overdue = await visit(doctor.id, { scheduledAt: fromNow(-(JOURNEY_START_WINDOW_HOURS + 1) * HOUR) });
    r = await travel(doctor, overdue.id, "ON_THE_WAY");
    check("visit long past: → 400 JOURNEY_TOO_LATE", r.status === 400 && r.json.code === "JOURNEY_TOO_LATE", `${r.status} ${r.json.error}`);
    const nurseTomorrow = await visit(nurse.id, { providerType: "NURSE", scheduledAt: fromNow(DAY) });
    r = await travel(nurse, nurseTomorrow.id, "ON_THE_WAY");
    check("nurse visit tomorrow → 400 (applies to nurses too)", r.status === 400 && r.json.code === "JOURNEY_TOO_EARLY", `${r.status}`);
    const created = fromNow(-5 * HOUR);
    const bookNowVisit = await visit(doctor.id, { createdAt: created, scheduledAt: created, acceptedAt: fromNow(-30 * MIN) });
    r = await travel(doctor, bookNowVisit.id, "ON_THE_WAY");
    check("book-now created 5h ago, accepted 30 min ago → can start", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // ── Start, updates, stop, restart, arrive ──
    await settle();
    const soon = await visit(doctor.id, { scheduledAt: fromNow(2 * HOUR) });
    let before = pushesTo(patient.id);
    r = await travel(doctor, soon.id, "ON_THE_WAY");
    check("visit in 2h: start journey → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await travel(doctor, soon.id, "ON_THE_WAY");
    r = await travel(doctor, soon.id, "ON_THE_WAY");
    check("position updates mid-journey → 200", r.status === 200, `${r.status}`);
    await settle();
    if (hasLog) check("one push for the start, none for position updates", pushesTo(patient.id) - before === 1, `${pushesTo(patient.id) - before} pushes`);

    r = await call(patient, "PATCH", `/api/appointments/${soon.id}`, { scheduledAt: fromNow(2 * DAY).toISOString() });
    check("while on the way: patient can't reschedule", r.status === 400 && (r.json.error ?? "").includes("on the way"), `${r.status} ${r.json.error}`);

    before = pushesTo(patient.id);
    r = await travel(doctor, soon.id, "NOT_STARTED", false);
    const stopped = await prisma.appointment.findUniqueOrThrow({ where: { id: soon.id } });
    check("stop journey → NOT_STARTED, shared position cleared", r.status === 200 && stopped.travelStatus === "NOT_STARTED" && stopped.doctorLat === null && stopped.doctorLocationUpdatedAt === null,
      `${r.status} ${stopped.travelStatus} ${stopped.doctorLat}`);
    await settle();
    if (hasLog) check("…patient told the journey stopped", pushesTo(patient.id) - before === 1, `${pushesTo(patient.id) - before} pushes`);
    r = await travel(doctor, soon.id, "NOT_STARTED", false);
    check("stopping again → 400", r.status === 400, `${r.status} ${r.json.error}`);

    r = await call(patient, "PATCH", `/api/appointments/${soon.id}`, { scheduledAt: new Date(Date.now() + 2 * HOUR + 30 * MIN).toISOString() });
    check("after stopping: patient can reschedule again", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    r = await travel(doctor, soon.id, "ON_THE_WAY");
    check("restart journey → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await travel(doctor, soon.id, "ARRIVED", false);
    check("arrive → 200", r.status === 200, `${r.status}`);
    r = await travel(doctor, soon.id, "NOT_STARTED", false);
    check("can't stop after arriving", r.status === 400, `${r.status} ${r.json.error}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
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
