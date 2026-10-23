// Concurrency test: racing cancels/declines of one paid appointment must
// refund it exactly once. Runs against a live dev server (npm run dev) and
// the DB in .env, using throwaway users that are deleted afterwards — no
// push tokens, no doctor profile (so no reassignment to a real doctor).
// Also races a patient cancel against the provider's other status changes
// (complete / no-show / accept / nurse package accept + decline, #69): the
// provider's write must never overwrite a cancel that already refunded.
// P3-20: a receptionist (STAFF) no-show races the same way, the claim
// re-checks arrived/time on the row, and a ₹0 accept's PAID marking commits
// with the claim (rolls back with it).
//
//   npm run test:cancel-race            (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { ALREADY_CLOSED_MESSAGE, AppointmentAlreadyClosedError, claimStatusChange } from "../src/lib/appointmentCancel";
import { settleIfFreeOnAccept } from "../src/lib/paymentOrders";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const PARALLEL = 8;
const FEE = 500;

type Actor = { cookie: string; body: Record<string, unknown> };

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-9);
  const doctor = await prisma.user.create({ data: { name: "Race Test Doctor", mobile: "7" + stamp, role: "DOCTOR" } });
  const patient = await prisma.user.create({ data: { name: "Race Test Patient", mobile: "6" + stamp, role: "PATIENT" } });
  // Completing / accepting needs an active plan; the doctor with no profile
  // above is kept for the cancel races (no reassignment).
  const planDoctor = await prisma.user.create({
    data: {
      name: "Race Test Plan Doctor", mobile: "8" + stamp, role: "DOCTOR",
      doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * 86400_000) } },
    },
  });
  const nurse = await prisma.user.create({
    data: { name: "Race Test Nurse", mobile: "9" + stamp, role: "NURSE", nurseProfile: { create: { status: "APPROVED", isVerified: true } } },
  });
  // The plan doctor's front desk — queue actions (no-show) but not complete.
  const staff = await prisma.user.create({
    data: { name: "Race Test Staff", mobile: "5" + stamp, role: "STAFF", staffAccount: { create: { doctorId: planDoctor.id } } },
  });
  const cookieFor = (u: typeof doctor) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile }, SECRET)}`;
  const asPatient: Actor = { cookie: cookieFor(patient), body: { status: "CANCELLED" } };
  const asDoctorCancel: Actor = { cookie: cookieFor(doctor), body: { status: "CANCELLED" } };
  const asDoctorReject: Actor = { cookie: cookieFor(doctor), body: { status: "REJECTED" } };

  const balance = async () => (await prisma.wallet.findUnique({ where: { userId: patient.id } }))?.balance ?? 0;

  async function race(label: string, status: string, actors: Actor[]) {
    const appt = await prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: doctor.id, symptoms: "race test", consultType: "VIDEO",
        status, paymentMethod: "ONLINE", paymentStatus: "PAID", amount: FEE,
        scheduledAt: new Date(Date.now() + 86400_000),
      },
    });
    const before = await balance();
    const statuses = await Promise.all(actors.map(async ({ cookie, body }) => {
      const r = await fetch(`${BASE}/api/appointments/${appt.id}`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.status;
    }));
    const credited = (await balance()) - before;
    const refundRows = await prisma.walletTransaction.count({ where: { refundOfAppointmentId: appt.id } });
    const wins = statuses.filter((s) => s === 200).length;
    const losersOk = statuses.every((s) => s === 200 || s === 400 || s === 409);
    const tally = Object.entries(statuses.reduce<Record<number, number>>((t, s) => ({ ...t, [s]: (t[s] ?? 0) + 1 }), {}))
      .map(([s, n]) => `${n}×${s}`).join(" ");
    check(label, wins === 1 && losersOk && credited === FEE && refundRows === 1,
      `responses ${tally}; wallet +₹${credited}; refund rows ${refundRows}`);
  }

  // A provider that loses the race must get the "already updated" 409, not
  // some other error that happens to share the status code.
  let wrong409 = 0;
  const patch = async (u: typeof doctor, apptId: string, body: object, delayMs = 0) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const r = await fetch(`${BASE}/api/appointments/${apptId}`, {
      method: "PATCH",
      headers: { cookie: cookieFor(u), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const { error } = await r.json() as { error?: string };
    if (r.status === 409 && u.id !== patient.id && error !== ALREADY_CLOSED_MESSAGE) {
      wrong409++;
      console.log(`  unexpected 409: ${error}`);
    }
    return r.status;
  };
  // Alternate who gets a head start so both orders are exercised.
  const stagger = (i: number) => (i % 3 === 0 ? 0 : i % 3 === 1 ? 30 : 0);
  const providerLead = (i: number) => (i % 3 === 2 ? 30 : 0);

  // Patient cancel vs provider COMPLETED / NO_SHOW on a paid visit 10 min in
  // the past: exactly one wins, and the final row agrees with the refund.
  async function closeRace(providerStatus: "COMPLETED" | "NO_SHOW", runs: number, provider = planDoctor) {
    let bad = 0;
    const seen: string[] = [];
    for (let i = 0; i < runs; i++) {
      const appt = await prisma.appointment.create({
        data: {
          patientId: patient.id, doctorId: planDoctor.id, symptoms: "race test", consultType: "VIDEO",
          status: "SCHEDULED", paymentMethod: "ONLINE", paymentStatus: "PAID", amount: FEE, paidAt: new Date(),
          scheduledAt: new Date(Date.now() - 10 * 60_000),
        },
      });
      const [p, d] = await Promise.all([
        patch(patient, appt.id, { status: "CANCELLED" }, stagger(i)),
        patch(provider, appt.id, { status: providerStatus }, providerLead(i)),
      ]);
      const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
      const refunds = await prisma.walletTransaction.count({ where: { refundOfAppointmentId: appt.id } });
      seen.push(`${p}/${d}→${row.status}${refunds ? "+refund" : ""}`);
      const oneWinner = [p, d].filter((s) => s === 200).length === 1 && [p, d].every((s) => [200, 400, 409].includes(s));
      const consistent = p === 200
        ? row.status === "CANCELLED" && refunds === 1
        : row.status === providerStatus && refunds === 0;
      if (!oneWinner || !consistent) bad++;
    }
    check(`patient cancel vs ${provider.role === "STAFF" ? "staff" : "doctor"} ${providerStatus} ×${runs}`, bad === 0, `${bad} bad; patient/doctor→final: ${seen.join(", ")}`);
  }

  // Patient cancel vs doctor accept on a pending request: both may succeed
  // (accept, then cancel) but a 200 cancel must leave the row CANCELLED.
  async function acceptRace(runs: number) {
    let bad = 0;
    const seen: string[] = [];
    for (let i = 0; i < runs; i++) {
      const appt = await prisma.appointment.create({
        data: {
          patientId: patient.id, doctorId: planDoctor.id, symptoms: "race test", consultType: "VIDEO",
          status: "PENDING_APPROVAL", paymentMethod: "ONLINE", paymentStatus: "PENDING", amount: FEE,
          scheduledAt: new Date(Date.now() + 2 * 86400_000 + i * 3600_000),
        },
      });
      const [p, d] = await Promise.all([
        patch(patient, appt.id, { status: "CANCELLED" }, stagger(i)),
        patch(planDoctor, appt.id, { status: "SCHEDULED" }, providerLead(i)),
      ]);
      const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
      seen.push(`${p}/${d}→${row.status}`);
      const ok = p === 200 ? row.status === "CANCELLED" : d === 200 && row.status === "SCHEDULED";
      if (!ok || ![200, 400, 409].includes(p) || ![200, 400, 409].includes(d)) bad++;
    }
    check(`patient cancel vs doctor accept ×${runs}`, bad === 0, `${bad} bad; patient/doctor→final: ${seen.join(", ")}`);
  }

  // Nurse answers a 2-visit package while the patient cancels visit 2: a
  // 200 cancel must leave visit 2 CANCELLED, and a 409 nurse answer must
  // leave visit 1 untouched (the group update rolls back as a whole).
  async function nursePackageRace(answer: "SCHEDULED" | "REJECTED", runs: number) {
    let bad = 0;
    const seen: string[] = [];
    for (let i = 0; i < runs; i++) {
      const pkg = await prisma.nursePackage.create({ data: { patientId: patient.id, nurseId: nurse.id, serviceId: "race-test", visits: 2 } });
      const base = Date.now() + 3 * 86400_000 + i * 6 * 3600_000;
      const [v1, v2] = await Promise.all([1, 2].map((n) => prisma.appointment.create({
        data: {
          patientId: patient.id, doctorId: nurse.id, providerType: "NURSE", symptoms: "race test", consultType: "HOME",
          status: "PENDING_APPROVAL", paymentMethod: "ONLINE", paymentStatus: "PENDING", amount: FEE,
          packageId: pkg.id, packageIndex: n, scheduledAt: new Date(base + (n - 1) * 86400_000),
        },
      })));
      const [p, d] = await Promise.all([
        patch(patient, v2.id, { status: "CANCELLED" }, stagger(i)),
        patch(nurse, v1.id, { status: answer }, providerLead(i)),
      ]);
      const r1 = await prisma.appointment.findUniqueOrThrow({ where: { id: v1.id } });
      const r2 = await prisma.appointment.findUniqueOrThrow({ where: { id: v2.id } });
      seen.push(`${p}/${d}→${r1.status},${r2.status}`);
      const ok = (p !== 200 || r2.status === "CANCELLED")
        && (d === 200 ? r1.status === answer : r1.status === "PENDING_APPROVAL")
        && [200, 400, 409].includes(p) && [200, 400, 409].includes(d);
      if (!ok) bad++;
    }
    check(`patient cancel vs nurse package ${answer === "SCHEDULED" ? "accept" : "decline"} ×${runs}`, bad === 0,
      `${bad} bad; patient/nurse→v1,v2: ${seen.join(", ")}`);
  }

  // The claim's guard: a row that no longer matches what the checks read
  // (here: not arrived, or the time moved ahead) loses even though its status still matches.
  async function guardChecks() {
    const home = await prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: planDoctor.id, symptoms: "race test", consultType: "HOME",
        status: "SCHEDULED", paymentMethod: "CASH", paymentStatus: "PENDING", amount: FEE, travelStatus: "ON_THE_WAY",
        scheduledAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    const notArrived = await prisma.$transaction((tx) =>
      claimStatusChange(tx, home.id, ["SCHEDULED"], { status: "NO_SHOW" }, { travelStatus: "ARRIVED" }))
      .then(() => "claimed", (e) => (e instanceof AppointmentAlreadyClosedError ? "lost" : String(e)));
    const notYet = await prisma.$transaction((tx) =>
      claimStatusChange(tx, home.id, ["SCHEDULED"], { status: "NO_SHOW" }, { scheduledAt: { lte: new Date(Date.now() - 3600_000) } }))
      .then(() => "claimed", (e) => (e instanceof AppointmentAlreadyClosedError ? "lost" : String(e)));
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: home.id } });
    check("claim guard: not arrived / time not passed → no write", notArrived === "lost" && notYet === "lost" && row.status === "SCHEDULED",
      `not arrived → ${notArrived}; time not passed → ${notYet}; row ${row.status}`);
    // Over HTTP: staff no-show of a home visit the doctor hasn't reached.
    const s = await patch(staff, home.id, { status: "NO_SHOW" });
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: home.id } });
    check("staff NO_SHOW before arrival is refused", s === 400 && after.status === "SCHEDULED", `staff → ${s}; row ${after.status}`);

    // ₹0 accept: the PAID marking runs on the claim's transaction, so if
    // that transaction fails the visit is neither accepted nor marked paid.
    const free = await prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: planDoctor.id, symptoms: "race test", consultType: "VIDEO",
        status: "PENDING_APPROVAL", paymentMethod: "ONLINE", paymentStatus: "PENDING", amount: 0,
        scheduledAt: new Date(Date.now() + 5 * 86400_000),
      },
    });
    let marked = 0;
    const rolled = await prisma.$transaction(async (tx) => {
      const claimed = await claimStatusChange(tx, free.id, ["PENDING_APPROVAL"], { status: "SCHEDULED", acceptedAt: new Date() });
      marked = (await settleIfFreeOnAccept([claimed], tx)).size;
      throw new Error("simulated failure after settle");
    }).then(() => "committed", (e: Error) => e.message);
    const freeRow = await prisma.appointment.findUniqueOrThrow({ where: { id: free.id } });
    check("₹0 accept settle rolls back with the claim", marked === 1 && rolled.startsWith("simulated")
      && freeRow.status === "PENDING_APPROVAL" && freeRow.paymentStatus === "PENDING",
      `marked ${marked} in tx; tx ${rolled}; row ${freeRow.status}/${freeRow.paymentStatus}`);
    const ok = await patch(planDoctor, free.id, { status: "SCHEDULED" });
    const accepted = await prisma.appointment.findUniqueOrThrow({ where: { id: free.id } });
    check("₹0 accept over HTTP → SCHEDULED + PAID together", ok === 200 && accepted.status === "SCHEDULED" && accepted.paymentStatus === "PAID",
      `doctor → ${ok}; row ${accepted.status}/${accepted.paymentStatus}`);
  }

  // P2-31: a desk CASH->ONLINE switch racing the doctor's complete. A cash
  // visit is marked PAID on completion, so an ONLINE visit must never come
  // out COMPLETED + PAID without a payment.
  async function paymentMethodRace(runs: number) {
    const mk = () => prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: planDoctor.id, bookedById: planDoctor.id, symptoms: "race test", consultType: "VIDEO",
        status: "SCHEDULED", paymentMethod: "CASH", paymentStatus: "PENDING", amount: FEE,
        scheduledAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    // Deterministic: the row switched to ONLINE after the route read CASH.
    const a = await mk();
    await prisma.appointment.update({ where: { id: a.id }, data: { paymentMethod: "ONLINE" } });
    const lost = await prisma.$transaction((tx) =>
      claimStatusChange(tx, a.id, ["SCHEDULED"], { status: "COMPLETED", paymentStatus: "PAID" }, { paymentMethod: "CASH" }))
      .then(() => "claimed", (e) => (e instanceof AppointmentAlreadyClosedError ? "lost" : String(e)));
    const aRow = await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } });
    check("claim guard: CASH->ONLINE switched before the claim → claim loses", lost === "lost" && aRow.status === "SCHEDULED" && aRow.paymentStatus === "PENDING",
      `claim ${lost}; row ${aRow.status}/${aRow.paymentMethod}/${aRow.paymentStatus}`);

    let bad = 0;
    const seen: string[] = [];
    for (let i = 0; i < runs; i++) {
      const appt = await mk();
      const [sw, done] = await Promise.all([
        fetch(`${BASE}/api/doctor/appointments/${appt.id}/payment-method`, {
          method: "PATCH", headers: { cookie: cookieFor(planDoctor), "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethod: "ONLINE" }),
        }).then((r) => r.status),
        patch(planDoctor, appt.id, { status: "COMPLETED" }, i % 2 ? 15 : 0),
      ]);
      const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
      seen.push(`${sw}/${done}→${row.status}/${row.paymentMethod}/${row.paymentStatus}`);
      const unpaidPaidOnline = row.paymentMethod === "ONLINE" && row.paymentStatus === "PAID";
      if (unpaidPaidOnline || ![200, 400, 409].includes(sw) || ![200, 400, 409].includes(done)) bad++;
    }
    check(`payment-method switch vs complete ×${runs}: never ONLINE+PAID without payment`, bad === 0, `${bad} bad; switch/complete→final: ${seen.join(", ")}`);
  }

  try {
    await race("patient ×8 cancel (SCHEDULED, paid)", "SCHEDULED", Array(PARALLEL).fill(asPatient));
    await race("doctor ×8 cancel (SCHEDULED, paid)", "SCHEDULED", Array(PARALLEL).fill(asDoctorCancel));
    await race("patient ×4 + doctor ×4 cancel", "SCHEDULED",
      Array.from({ length: PARALLEL }, (_, i) => (i % 2 ? asPatient : asDoctorCancel)));
    await race("doctor ×8 decline (PENDING_APPROVAL after reschedule, paid)", "PENDING_APPROVAL", Array(PARALLEL).fill(asDoctorReject));

    // The unique key is the last line of defence even if a code path skips the status claim.
    const appt = await prisma.appointment.findFirstOrThrow({ where: { patientId: patient.id } });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: patient.id } });
    const dup = await prisma.walletTransaction
      .create({ data: { walletId: wallet.id, type: "CANCELLATION_REFUND", amount: FEE, refundOfAppointmentId: appt.id } })
      .then(() => "created", (e: { code?: string }) => e.code ?? "error");
    check("second refund row for the same appointment", dup === "P2002", `insert → ${dup}`);

    await closeRace("COMPLETED", 6);
    await closeRace("NO_SHOW", 6);
    await closeRace("NO_SHOW", 6, staff);
    await acceptRace(6);
    await nursePackageRace("SCHEDULED", 6);
    await nursePackageRace("REJECTED", 6);
    await guardChecks();
    await paymentMethodRace(8);
    check("provider 409s are all the already-updated error", wrong409 === 0, `${wrong409} other 409(s)`);
  } finally {
    const ids = [patient.id, doctor.id, planDoctor.id, nurse.id, staff.id];
    await prisma.appointment.deleteMany({ where: { patientId: patient.id } });
    await prisma.nursePackage.deleteMany({ where: { patientId: patient.id } });
    await prisma.staffProfile.deleteMany({ where: { userId: staff.id } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
