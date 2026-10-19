// Video calls (BUG-TRACKER #38): join only within the window around the
// booked time, the "video started" push once per appointment (even with two
// simultaneous joins), and per-person uids on the token. Pure checks, then
// API checks against a live dev server and the DB in .env (real Agora token
// generation, no call is placed), throwaway users only.
//
// Push checks count the server's "sendPushToUsers(<id>): …" log lines, so run
// the dev server with its output in DEV_LOG (default /tmp/doconclick-dev.log).
// Users get dummy push tokens — FCM rejects them, nothing is delivered.
//
//   npm run test:video
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { videoJoinWindow, VIDEO_JOIN_EARLY_MINUTES, VIDEO_JOIN_LATE_MINUTES } from "../src/lib/videoCall";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DEV_LOG = process.env.DEV_LOG ?? "/tmp/doconclick-dev.log";
const MIN = 60_000;
const ago = (m: number) => new Date(Date.now() - m * MIN);

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function token(u: U, apptId: string) {
  const res = await fetch(`${BASE}/api/appointments/${apptId}/video-token`, { headers: { Cookie: cookieFor(u) } });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string } };
}
const hasLog = fs.existsSync(DEV_LOG);
const pushesTo = (userId: string) => (hasLog ? fs.readFileSync(DEV_LOG, "utf8").split(`sendPushToUsers(${userId}):`).length - 1 : 0);
const settle = () => new Promise((r) => setTimeout(r, 2500));

async function main() {
  // ── The window ──
  const timed = videoJoinWindow({ scheduledAt: new Date(10 * 60 * MIN), createdAt: new Date(0) });
  check(`timed booking opens ${VIDEO_JOIN_EARLY_MINUTES} min early`, timed.opensAt === 10 * 60 * MIN - VIDEO_JOIN_EARLY_MINUTES * MIN, "ok");
  check(`…closes ${VIDEO_JOIN_LATE_MINUTES} min after`, timed.closesAt === 10 * 60 * MIN + VIDEO_JOIN_LATE_MINUTES * MIN, "ok");
  const now = new Date(5 * 60 * MIN);
  const bookNow = videoJoinWindow({ scheduledAt: now, createdAt: now, acceptedAt: new Date(6 * 60 * MIN), paidAt: new Date(7 * 60 * MIN) });
  check("book-now: open from the start, closes after the later of accept/pay", bookNow.opensAt === 0 && bookNow.closesAt === 7 * 60 * MIN + VIDEO_JOIN_LATE_MINUTES * MIN, "ok");

  // ── API ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `4${stamp}${n++}`, ...data } as never });
    ids.push(u.id);
    await prisma.pushToken.create({ data: { userId: u.id, token: `test-video-${stamp}-${n}` } });
    return u;
  };
  const doctor = await mk({
    name: "Video Doctor", role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * MIN), offersVideo: true } },
  });
  const patient = await mk({ name: "Video Patient", role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 30, gender: "Male" } } });
  const outsider = await mk({ name: "Video Outsider", role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 30, gender: "Male" } } });

  // Paid a few minutes ago, so the post-payment unlock delay has passed.
  const appt = (extra: Record<string, unknown>) => prisma.appointment.create({
    data: {
      doctorId: doctor.id, patientId: patient.id, status: "SCHEDULED", consultType: "VIDEO", symptoms: "cough", amount: 300,
      paymentMethod: "ONLINE", paymentStatus: "PAID", paidAt: ago(5), acceptedAt: ago(10), ...extra,
    } as never,
  });

  try {
    // ── Window ──
    const tomorrow = await appt({ createdAt: ago(60), scheduledAt: new Date(Date.now() + 24 * 60 * MIN) });
    let r = await token(patient, tomorrow.id);
    check("booked for tomorrow → 403 VIDEO_NOT_OPEN_YET + availableAt", r.status === 403 && r.json.code === "VIDEO_NOT_OPEN_YET" && typeof r.json.availableAt === "string", `${r.status} ${r.json.error} ${r.json.availableAt}`);

    const longAgo = await appt({ createdAt: ago(600), scheduledAt: ago(VIDEO_JOIN_LATE_MINUTES + 30) });
    r = await token(patient, longAgo.id);
    check("timed visit long past → 403 VIDEO_WINDOW_CLOSED", r.status === 403 && r.json.code === "VIDEO_WINDOW_CLOSED", `${r.status} ${r.json.error}`);

    const staleNow = ago(VIDEO_JOIN_LATE_MINUTES + 60);
    const staleBookNow = await appt({ createdAt: staleNow, scheduledAt: staleNow, acceptedAt: staleNow, paidAt: staleNow });
    r = await token(patient, staleBookNow.id);
    check("book-now accepted+paid hours ago → closed", r.status === 403 && r.json.code === "VIDEO_WINDOW_CLOSED", `${r.status}`);

    const freshNow = ago(300);
    const lateAccepted = await appt({ createdAt: freshNow, scheduledAt: freshNow, acceptedAt: ago(20), paidAt: ago(5) });
    r = await token(patient, lateAccepted.id);
    check("book-now created 5h ago but accepted/paid just now → open", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // ── Token + uid ──
    const soon = await appt({ createdAt: ago(60), scheduledAt: new Date(Date.now() + 5 * MIN) });
    await settle(); // let the joins above finish their (fire-and-forget) pushes first
    const beforeDoctor = pushesTo(doctor.id);
    const beforePatient = pushesTo(patient.id);
    r = await token(patient, soon.id);
    check("joining 5 min before → 200 with a token", r.status === 200 && typeof r.json.token === "string" && (r.json.token as string).length > 20, `${r.status} ${r.json.error ?? ""}`);
    check("token issued for the patient's own uid (not 0)", r.json.uid === patient.id, `${r.json.uid}`);
    const d = await token(doctor, soon.id);
    check("doctor gets their own uid", d.status === 200 && d.json.uid === doctor.id && d.json.token !== r.json.token, `${d.status} ${d.json.uid}`);
    check("token lifetime reported", d.json.expiresInSeconds === 3600, `${d.json.expiresInSeconds}`);

    // ── Push once ──
    for (let i = 0; i < 3; i++) await token(patient, soon.id); // rejoins / renewals
    await settle();
    if (hasLog) {
      check("first join pushes the other party once", pushesTo(doctor.id) - beforeDoctor === 1, `${pushesTo(doctor.id) - beforeDoctor} pushes to doctor`);
      check("…the second person joining doesn't push again", pushesTo(patient.id) === beforePatient, `${pushesTo(patient.id) - beforePatient} pushes to patient`);
    }
    const stamped = await prisma.appointment.findUniqueOrThrow({ where: { id: soon.id } });
    check("videoStartedPushAt recorded", !!stamped.videoStartedPushAt, `${stamped.videoStartedPushAt?.toISOString()}`);

    const race = await appt({ createdAt: ago(60), scheduledAt: new Date(Date.now() + 2 * MIN) });
    const bD = pushesTo(doctor.id), bP = pushesTo(patient.id);
    await Promise.all([token(patient, race.id), token(doctor, race.id), token(patient, race.id)]);
    await settle();
    if (hasLog) check("simultaneous first joins → exactly one push", (pushesTo(doctor.id) - bD) + (pushesTo(patient.id) - bP) === 1, `${(pushesTo(doctor.id) - bD) + (pushesTo(patient.id) - bP)} pushes`);

    r = await token(outsider, soon.id);
    check("someone else's appointment → 404", r.status === 404, `${r.status}`);
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
