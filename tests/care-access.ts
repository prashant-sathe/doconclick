// Care access (BUG-TRACKER #33): a provider sees a patient's history and
// vitals only with a SCHEDULED visit, or a COMPLETED one within the window
// (src/lib/careAccess.ts) — never via a pending/declined/cancelled booking,
// and (#82/#83) a walk-in the doctor's desk booked never counts, even COMPLETED.
// Pure checks, then API checks against a live dev server and the DB in .env,
// throwaway users only.
//
//   npm run test:care-access
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { hasCareAccess, CARE_ACCESS_WINDOW_DAYS } from "../src/lib/careAccess";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 24 * 60 * 60_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function get(u: U, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookieFor(u) } });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as unknown };
}
const err = (json: unknown) => (json as { error?: string }).error ?? "";

async function main() {
  // ── The rule ──
  const v = (status: string, at: Date) => ({ status, scheduledAt: at });
  check("no visits → no access", !hasCareAccess([]), "false");
  check("pending / rejected / expired / cancelled → no access",
    !hasCareAccess([v("PENDING_APPROVAL", daysAgo(-2)), v("REJECTED", daysAgo(1)), v("EXPIRED", daysAgo(3)), v("CANCELLED", daysAgo(4))]), "false");
  check("scheduled (upcoming) → access", hasCareAccess([v("SCHEDULED", daysAgo(-10))]), "true");
  check("completed inside the window → access", hasCareAccess([v("COMPLETED", daysAgo(CARE_ACCESS_WINDOW_DAYS - 1))]), "true");
  check("completed past the window → no access", !hasCareAccess([v("COMPLETED", daysAgo(CARE_ACCESS_WINDOW_DAYS + 1))]), "false");
  check("old completed + new scheduled → access", hasCareAccess([v("COMPLETED", daysAgo(200)), v("SCHEDULED", daysAgo(-3))]), "true");
  const desk = (status: string, at: Date) => ({ status, scheduledAt: at, bookedById: "desk" });
  check("desk-made walk-in still scheduled → no access", !hasCareAccess([desk("SCHEDULED", daysAgo(0))]), "false");
  check("#83 desk-made walk-in completed inside the window → no access", !hasCareAccess([desk("COMPLETED", daysAgo(1))]), "false");
  check("#83 own completed visit + desk-made completed walk-in → access", hasCareAccess([v("COMPLETED", daysAgo(5)), desk("COMPLETED", daysAgo(1))]), "true");
  check("desk-made walk-in completed past the window → no access", !hasCareAccess([desk("COMPLETED", daysAgo(CARE_ACCESS_WINDOW_DAYS + 1))]), "false");
  check("lapsed visit + new desk-made walk-in → no access", !hasCareAccess([v("COMPLETED", daysAgo(200)), desk("SCHEDULED", daysAgo(0))]), "false");
  check("self-booked accepted + desk-made walk-in → access", hasCareAccess([v("SCHEDULED", daysAgo(-1)), desk("SCHEDULED", daysAgo(0))]), "true");

  // ── API ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `8${stamp}${n++}`, ...data } as never });
    ids.push(u.id);
    return u;
  };
  const doctor = await mk({
    name: "Access Doctor", role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY) } },
  });
  const nurse = await mk({ name: "Access Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });
  const patientOf = (name: string) => mk({ name, role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 40, gender: "Male" } } });
  const pending = await patientOf("Access Pending");
  const declined = await patientOf("Access Declined");
  const scheduled = await patientOf("Access Scheduled");
  const recent = await patientOf("Access Recent");
  const lapsed = await patientOf("Access Lapsed");
  const returning = await patientOf("Access Returning");
  const walkIn = await patientOf("Access WalkIn");
  const walkInDone = await patientOf("Access WalkIn Done");
  const walkInOwn = await patientOf("Access WalkIn Own");
  const lapsedWalkIn = await patientOf("Access Lapsed WalkIn");
  const parentProfile = await prisma.patientProfile.findUniqueOrThrow({ where: { userId: scheduled.id } });
  const child = await prisma.patientDependent.create({ data: { patientProfileId: parentProfile.id, name: "Access Child", relation: "Son" } });

  const appt = (providerId: string, patientId: string, status: string, scheduledAt: Date, extra: Record<string, unknown> = {}) =>
    prisma.appointment.create({ data: { doctorId: providerId, patientId, status, scheduledAt, symptoms: "check", amount: 500, consultType: "VIDEO", ...extra } as never });
  await appt(doctor.id, pending.id, "PENDING_APPROVAL", daysAgo(-2));
  await appt(doctor.id, declined.id, "REJECTED", daysAgo(5));
  await appt(doctor.id, declined.id, "CANCELLED", daysAgo(3));
  await appt(doctor.id, declined.id, "EXPIRED", daysAgo(1));
  await appt(doctor.id, scheduled.id, "SCHEDULED", daysAgo(-3));
  await appt(doctor.id, recent.id, "COMPLETED", daysAgo(30));
  await appt(doctor.id, lapsed.id, "COMPLETED", daysAgo(CARE_ACCESS_WINDOW_DAYS + 10));
  await appt(doctor.id, returning.id, "COMPLETED", daysAgo(200));
  await appt(doctor.id, returning.id, "SCHEDULED", daysAgo(-5));
  // #82: walk-ins the doctor's desk booked (bookedById set).
  await appt(doctor.id, walkIn.id, "SCHEDULED", daysAgo(0), { consultType: "CLINIC", bookedById: doctor.id });
  await appt(doctor.id, walkInDone.id, "COMPLETED", daysAgo(1), { consultType: "CLINIC", bookedById: doctor.id });
  await appt(doctor.id, walkInOwn.id, "SCHEDULED", daysAgo(0), { consultType: "CLINIC", bookedById: doctor.id });
  await appt(doctor.id, walkInOwn.id, "SCHEDULED", daysAgo(-2));
  // P3-21: old self visit lapsed + a fresh desk walk-in.
  await appt(doctor.id, lapsedWalkIn.id, "COMPLETED", daysAgo(200));
  await appt(doctor.id, lapsedWalkIn.id, "SCHEDULED", daysAgo(0), { consultType: "CLINIC", bookedById: doctor.id });
  await appt(nurse.id, pending.id, "PENDING_APPROVAL", daysAgo(-1), { providerType: "NURSE", consultType: "HOME" });
  await appt(nurse.id, scheduled.id, "SCHEDULED", daysAgo(-1), { providerType: "NURSE", consultType: "HOME" });
  // A recent reading for every patient, so the dashboard check can tell who gets one.
  for (const p of [pending, declined, scheduled, recent, lapsed, returning, walkIn, walkInDone, walkInOwn, lapsedWalkIn]) {
    await prisma.vitalReading.create({ data: { patientId: p.id, recordedById: nurse.id, pulse: 80, recordedAt: daysAgo(1) } });
  }

  try {
    const history = (p: U, dep?: string) => get(doctor, `/api/doctors/patients/${p.id}${dep ? `?dependentId=${dep}` : ""}`);
    const vitals = (as: U, p: U, dep?: string) => get(as, `/api/vitals?patientId=${p.id}${dep ? `&dependentId=${dep}` : ""}`);

    for (const [label, p, ok] of [
      ["pending request", pending, false],
      ["declined / cancelled / expired", declined, false],
      ["accepted upcoming visit", scheduled, true],
      ["completed 30 days ago", recent, true],
      [`completed ${CARE_ACCESS_WINDOW_DAYS + 10} days ago`, lapsed, false],
      ["lapsed but booked again and accepted", returning, true],
      ["desk-made walk-in still scheduled", walkIn, false],
      ["#83 desk-made walk-in completed", walkInDone, false],
      ["desk-made walk-in + own accepted booking", walkInOwn, true],
      ["P3-21 lapsed visit + new desk walk-in", lapsedWalkIn, false],
    ] as const) {
      const h = await history(p);
      check(`history: ${label} → ${ok ? 200 : 403}`, h.status === (ok ? 200 : 403), `${h.status} ${err(h.json)}`);
      const vt = await vitals(doctor, p);
      check(`doctor vitals: ${label} → ${ok ? 200 : 403}`, vt.status === (ok ? 200 : 403), `${vt.status} ${err(vt.json)}`);
    }
    const lapsedMsg = err((await history(lapsed)).json);
    check("lapsed access explains the window", lapsedMsg.includes(`${CARE_ACCESS_WINDOW_DAYS} days after your last visit`), lapsedMsg);

    const walkInMsg = (await history(walkIn)).json as { error?: string; code?: string };
    check("scheduled walk-in explains it opens once the patient books themselves", walkInMsg.code === "NO_CARE_ACCESS" && (walkInMsg.error ?? "").includes("book a visit with you themselves"), JSON.stringify(walkInMsg));
    const doneMsg = (await history(walkInDone)).json as { error?: string; code?: string };
    check("#83 completed walk-in gets the same walk-in message", doneMsg.code === "NO_CARE_ACCESS" && (doneMsg.error ?? "").includes("book a visit with you themselves"), JSON.stringify(doneMsg));

    const lwMsg = (await history(lapsedWalkIn)).json as { error?: string; code?: string };
    check("P3-21 lapsed + walk-in: says ended AND that the walk-in does not reopen it", lwMsg.code === "NO_CARE_ACCESS" && (lwMsg.error ?? "").includes("ended") && (lwMsg.error ?? "").includes("walk-in you booked doesn't reopen"), JSON.stringify(lwMsg));

    const dep = await history(scheduled, child.id);
    check("parent's visit doesn't open the child's history", dep.status === 403, `${dep.status} ${err(dep.json)}`);
    const depV = await vitals(doctor, scheduled, child.id);
    check("…nor the child's vitals", depV.status === 403, `${depV.status}`);

    let r = await vitals(nurse, pending);
    check("nurse vitals: pending booking → 403", r.status === 403, `${r.status} ${err(r.json)}`);
    r = await vitals(nurse, scheduled);
    check("nurse vitals: accepted visit → 200", r.status === 200, `${r.status} ${err(r.json)}`);

    r = await get(scheduled, `/api/doctors/patients/${scheduled.id}`);
    check("patient role on the doctor history route → 403", r.status === 403, `${r.status}`);

    // Doctor dashboard: latest vitals only on rows for people with access.
    const rows = (await get(doctor, "/api/appointments/me")).json as { patientId: string; latestVitals: unknown; recentVitalsCount: number }[];
    const vitalsFor = (p: U) => rows.filter((a) => a.patientId === p.id).map((a) => !!a.latestVitals || a.recentVitalsCount > 0);
    check("dashboard: no vitals on a pending request", vitalsFor(pending).every((x) => !x), JSON.stringify(vitalsFor(pending)));
    check("dashboard: no vitals for declined / lapsed", [...vitalsFor(declined), ...vitalsFor(lapsed)].every((x) => !x), "hidden");
    check("dashboard: vitals shown for accepted / recent", vitalsFor(scheduled).every(Boolean) && vitalsFor(recent).every(Boolean), "shown");
    check("dashboard: no vitals on a scheduled desk-made walk-in", vitalsFor(walkIn).length > 0 && vitalsFor(walkIn).every((x) => !x), JSON.stringify(vitalsFor(walkIn)));
    check("dashboard: vitals on a walk-in with the patient's own accepted booking", vitalsFor(walkInOwn).length > 0 && vitalsFor(walkInOwn).every(Boolean), JSON.stringify(vitalsFor(walkInOwn)));
  } finally {
    await prisma.vitalReading.deleteMany({ where: { recordedById: nurse.id } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
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
