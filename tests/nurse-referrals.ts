// Nurse referrals (BUG-TRACKER #35): usable only from a COMPLETED consult,
// void once the consult is cancelled, deletable by the doctor then, and the
// patient is pushed when a referral becomes bookable. Against a live dev
// server and the DB in .env, throwaway users only.
//
// Push checks count the server's "sendPushToUsers(<id>): …" log lines, so run
// the dev server with its output in DEV_LOG (default /tmp/doconclick-dev.log).
// The patient gets a dummy push token — FCM rejects it, nothing is delivered.
//
//   npm run test:nurse-referrals
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DEV_LOG = process.env.DEV_LOG ?? "/tmp/doconclick-dev.log";
const DAY = 24 * 60 * 60_000;

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
const settle = () => new Promise((r) => setTimeout(r, 2500)); // pushes are fire-and-forget

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `6${stamp}${n++}`, ...data } as never });
    ids.push(u.id);
    return u;
  };
  const HOME = { lat: 18.5204, lng: 73.8567 };
  const doctor = await mk({
    name: "Referral Doctor", role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY) } },
  });
  const nurse = await mk({
    name: "Referral Nurse", role: "NURSE",
    nurseProfile: {
      create: {
        status: "APPROVED", ...HOME, radius: 10, availability: "Sun-Sat, 12AM-11:59PM",
        registrationFeePaid: true, subscriptionPaidUntil: new Date(Date.now() + 30 * DAY),
      },
    },
  });
  const patient = await mk({
    name: "Referral Patient", role: "PATIENT", termsAcceptedAt: new Date(),
    patientProfile: { create: { age: 50, gender: "Female", homeAddress: "4 Care Rd, Pune", pinCode: "411001", ...HOME } },
  });
  await prisma.pushToken.create({ data: { userId: patient.id, token: `test-dummy-${stamp}` } });
  const service = await prisma.nurseService.create({ data: { name: `Referral Injection ${stamp}`, requiresPrescription: true, durationMinutes: 30 } });
  const nurseProfile = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } });
  await prisma.nurseServiceOffering.create({ data: { nurseProfileId: nurseProfile.id, serviceId: service.id, price: 400 } });

  const consult = (status: string) => prisma.appointment.create({
    data: { doctorId: doctor.id, patientId: patient.id, status, scheduledAt: new Date(Date.now() - 60 * 60_000), symptoms: "fever", amount: 500, consultType: "VIDEO", paymentMethod: "CASH" },
  });
  const refer = (apptId: string) => call(doctor, "POST", `/api/appointments/${apptId}/nurse-referral`, { serviceId: service.id, visits: 3, intervalDays: 1, instructions: "Inj. daily" });
  let hour = 0;
  const bookNurse = (referralId: string) => call(patient, "POST", "/api/nurse-bookings", {
    nurseId: nurse.id, serviceId: service.id, consentGiven: true, nurseReferralId: referralId,
    scheduledAt: new Date(Date.now() + 2 * DAY + ++hour * 60 * 60_000).toISOString(),
  });

  try {
    // ── Referral written during an accepted consult: not usable until completed ──
    const c1 = await consult("SCHEDULED");
    let before = pushesTo(patient.id);
    let r = await refer(c1.id);
    const ref1 = String(r.json.id ?? "");
    await settle();
    check("doctor adds a referral during the consult → 200", r.status === 200 && !!ref1, `${r.status} ${r.json.error ?? ""}`);
    if (hasLog) check("…no push yet (not bookable until completed)", pushesTo(patient.id) === before, `${pushesTo(patient.id) - before} pushes`);
    r = await call(patient, "GET", `/api/nurse-referrals/${ref1}`);
    check("referral GET before completion → 409 REFERRAL_INACTIVE", r.status === 409 && r.json.code === "REFERRAL_INACTIVE", `${r.status} ${r.json.error}`);
    r = await bookNurse(ref1);
    check("booking with it before completion → 400 REFERRAL_INACTIVE", r.status === 400 && r.json.code === "REFERRAL_INACTIVE", `${r.status} ${r.json.error}`);

    before = pushesTo(patient.id);
    r = await call(doctor, "PATCH", `/api/appointments/${c1.id}`, { status: "COMPLETED" });
    await settle();
    check("doctor completes the consult", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    if (hasLog) check("…patient pushed: completed + referral now bookable", pushesTo(patient.id) - before === 2, `${pushesTo(patient.id) - before} pushes`);
    r = await call(patient, "GET", `/api/nurse-referrals/${ref1}`);
    check("referral GET after completion → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await bookNurse(ref1);
    check("prescription-only service booked with the referral → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // ── Added after completion: pushed straight away, once ──
    const c2 = await consult("COMPLETED");
    before = pushesTo(patient.id);
    r = await refer(c2.id);
    await settle();
    check("referral on a completed consult → 200", r.status === 200, `${r.status}`);
    if (hasLog) check("…patient pushed once", pushesTo(patient.id) - before === 1, `${pushesTo(patient.id) - before} pushes`);
    before = pushesTo(patient.id);
    r = await refer(c2.id);
    await settle();
    if (hasLog) check("editing it doesn't push again", pushesTo(patient.id) === before, `${pushesTo(patient.id) - before} pushes`);

    // ── Cancelled consult: void, and deletable ──
    const c3 = await consult("SCHEDULED");
    r = await refer(c3.id);
    const ref3 = String(r.json.id ?? "");
    r = await call(patient, "PATCH", `/api/appointments/${c3.id}`, { status: "CANCELLED" });
    check("patient cancels the consult", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(patient, "GET", `/api/nurse-referrals/${ref3}`);
    check("referral from a cancelled consult → 409, says why", r.status === 409 && (r.json.error ?? "").includes("cancelled"), `${r.status} ${r.json.error}`);
    r = await bookNurse(ref3);
    check("…can't unlock a prescription-only service", r.status === 400 && r.json.code === "REFERRAL_INACTIVE", `${r.status} ${r.json.error}`);
    r = await refer(c3.id);
    check("doctor can't write a referral on a cancelled consult", r.status === 400, `${r.status} ${r.json.error}`);
    const dash = (await call(doctor, "GET", "/api/appointments/me")).json as unknown as { id: string; referralGiven?: { id: string } | null }[];
    check("dashboard shows the void referral on the cancelled row", dash.find((a) => a.id === c3.id)?.referralGiven?.id === ref3, "listed");
    r = await call(doctor, "DELETE", `/api/appointments/${c3.id}/nurse-referral`);
    check("doctor deletes it on the cancelled consult → 200", r.status === 200 && !(await prisma.nurseReferral.findUnique({ where: { id: ref3 } })), `${r.status} ${r.json.error ?? ""}`);

    // ── Assistant only counts referrals from completed consults ──
    const live = await prisma.nurseReferral.findMany({ where: { serviceId: service.id, appointment: { patientId: patient.id, status: "COMPLETED" }, bookings: { none: {} } } });
    check("assistant-style lookup: only the completed, unbooked referral (c2)", live.length === 1 && live[0].appointmentId === c2.id, `${live.length}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.nursePackage.deleteMany({ where: { nurseId: nurse.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.nurseService.deleteMany({ where: { id: service.id } });
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
