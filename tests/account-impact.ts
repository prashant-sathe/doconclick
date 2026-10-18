// Admin impact step (BUG-TRACKER #19): suspending/deleting a doctor or nurse,
// or deleting a patient, first returns their future live bookings (and a
// patient's wallet balance) as 409 ACCOUNT_HAS_IMPACT; on confirm the
// bookings are cancelled + refunded to the wallet, or — doctors only —
// reassigned to another free doctor, and patients pushed.
// Runs against a live dev server and the DB in .env, throwaway users only.
// The replacement doctor has a made-up specialty, so no real doctor is ever
// picked. Push checks need DEV_LOG (see tests/admin-doctor-status.ts).
//
//   DEV_LOG=/tmp/next-dev.log npm run test:account-impact
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DEV_LOG = process.env.DEV_LOG;
const DAY = 24 * 60 * 60 * 1000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}
const pushAttempts = () => (DEV_LOG ? (fs.readFileSync(DEV_LOG, "utf8").match(/sendPushToUsers failed/g) ?? []).length : 0);
const settle = () => new Promise((r) => setTimeout(r, 1200));

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const specialty = `ImpactTest ${stamp}`;
  const bookable = { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY), specialty };
  const ids: string[] = [];
  let n = 0;
  const mk = async (role: string, extra: Record<string, unknown> = {}) => {
    const u = await prisma.user.create({ data: { name: `Impact ${role} ${++n}`, mobile: `5${stamp}${String(n).padStart(2, "0")}`, role, ...extra } as never });
    ids.push(u.id);
    return u;
  };
  const admin = await mk("ADMIN");
  const doctorA = await mk("DOCTOR", { doctorProfile: { create: { ...bookable, offersVideo: true, videoFee: 300 } } });
  // The only possible replacement: same specialty, video only, free.
  const doctorB = await mk("DOCTOR", { doctorProfile: { create: { ...bookable, offersVideo: true, videoFee: 450, offersClinic: false, offersHomeVisit: false } } });
  const doctorC = await mk("DOCTOR", { doctorProfile: { create: { ...bookable, specialty: `${specialty} other` } } });
  const doctorIdle = await mk("DOCTOR", { doctorProfile: { create: bookable } });
  const nurse = await mk("NURSE", { nurseProfile: { create: { status: "APPROVED", councilRegNo: `IMP${stamp}`, councilCertUrl: "https://x/c.pdf", lat: 18.5, lng: 73.8 } } });
  const nurseIdle = await mk("NURSE", { nurseProfile: { create: { status: "APPROVED" } } });
  const patient = await mk("PATIENT", { patientProfile: { create: { age: 30, gender: "Male" } }, pushTokens: { create: { token: `impact-${stamp}` } } });
  const walletPatient = await mk("PATIENT", { patientProfile: { create: { age: 40, gender: "Female" } } });
  const homePatient = await mk("PATIENT", { patientProfile: { create: { age: 50, gender: "Male" } } });
  await prisma.wallet.create({ data: { userId: walletPatient.id, balance: 50 } });

  const cookie = `doconclick_token=${jwt.sign({ id: admin.id, name: admin.name, role: "ADMIN", mobile: admin.mobile, tv: 0 }, SECRET)}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  let minute = 0;
  const appt = (doctorId: string, data: Record<string, unknown>, patientId = patient.id) =>
    prisma.appointment.create({
      data: {
        patientId, doctorId, symptoms: "t", consultType: "VIDEO", amount: 300, status: "SCHEDULED",
        scheduledAt: new Date(Date.now() + DAY + ++minute * 15 * 60_000), ...data,
      } as never,
    });
  const statusOf = async (id: string) => (await prisma.appointment.findUniqueOrThrow({ where: { id } })).status;

  try {
    // ── Suspend a doctor, reassigning ──
    const vidPaid = await appt(doctorA.id, { paymentMethod: "ONLINE", paymentStatus: "PAID", discountAmount: 50 });
    const vidUnpaid = await appt(doctorA.id, {});
    const clinicVisit = await appt(doctorA.id, { consultType: "CLINIC", paymentMethod: "ONLINE", paymentStatus: "PAID" });
    const pending = await appt(doctorA.id, { status: "PENDING_APPROVAL", scheduledAt: new Date(Date.now() - 5 * 60_000) });
    const past = await appt(doctorA.id, { scheduledAt: new Date(Date.now() - 2 * DAY), paymentMethod: "ONLINE", paymentStatus: "PAID" });
    const expected = [vidPaid.id, vidUnpaid.id, clinicVisit.id, pending.id];

    let r = await call("PATCH", `/api/admin/doctors/${doctorA.id}`, { status: "SUSPENDED" });
    const imp = r.json.impact;
    check("suspend asks for the impact step", r.status === 409 && r.json.code === "ACCOUNT_HAS_IMPACT", `${r.status} ${r.json.code}`);
    check("impact: future live bookings only",
      imp?.count === 4 && [...imp.bookings.map((b: { id: string }) => b.id)].sort().join() === [...expected].sort().join(),
      `count ${imp?.count}`);
    check("impact: refund total + reassign offered", imp?.refundTotal === 550 && imp?.canReassign === true && imp?.walletBalance === null,
      `refund ${imp?.refundTotal}, canReassign ${imp?.canReassign}`);
    check("nothing changed yet", (await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorA.id } })).status === "APPROVED", "still APPROVED");
    r = await call("PATCH", `/api/admin/doctors/${doctorA.id}`, { status: "SUSPENDED", confirmBookingIds: expected });
    check("ids without an action asks again", r.status === 409 && r.json.code === "ACCOUNT_HAS_IMPACT", `${r.status}`);
    r = await call("PATCH", `/api/admin/doctors/${doctorA.id}`, { status: "SUSPENDED", bookingAction: "MOVE", confirmBookingIds: expected });
    check("unknown action rejected", r.status === 400, `${r.status}`);

    const before = pushAttempts();
    r = await call("PATCH", `/api/admin/doctors/${doctorA.id}`, { status: "SUSPENDED", bookingAction: "REASSIGN", confirmBookingIds: expected });
    await settle();
    check("confirmed suspend", r.status === 200 && r.json.status === "SUSPENDED", `${r.status} ${r.json.error ?? ""}`);
    check("3 video bookings reassigned, clinic visit cancelled",
      r.json.bookings?.reassigned === 3 && r.json.bookings?.cancelled === 1 && r.json.bookings?.refundTotal === 550,
      JSON.stringify(r.json.bookings));
    const moved = await prisma.appointment.findMany({ where: { doctorId: doctorB.id, reassignedFromId: { in: expected } } });
    check("replacements are pending requests with doctor B at the same times",
      moved.length === 3 && moved.every((m) => m.status === "PENDING_APPROVAL" && m.paymentStatus === "PENDING" && m.amount === 450),
      `${moved.length} moved`);
    check("originals cancelled, past visit untouched",
      (await Promise.all(expected.map(statusOf))).every((s) => s === "CANCELLED") && (await statusOf(past.id)) === "SCHEDULED", "ok");
    const w = await prisma.wallet.findUnique({ where: { userId: patient.id }, include: { transactions: true } });
    check("paid amounts credited to wallet", w?.balance === 550
      && w.transactions.some((t) => t.refundOfAppointmentId === vidPaid.id && t.type === "REASSIGNMENT_CREDIT" && t.amount === 250),
      `balance ${w?.balance}`);
    // Only the patient has a push token here: 3 "reassigned" + 1 "cancelled".
    if (DEV_LOG) check("one push per patient booking", pushAttempts() - before === 4, `${pushAttempts() - before} push(es)`);

    // ── Doctor with no bookings: no impact step ──
    r = await call("PATCH", `/api/admin/doctors/${doctorIdle.id}`, { status: "SUSPENDED" });
    check("no bookings → suspends straight away", r.status === 200 && r.json.status === "SUSPENDED", `${r.status}`);

    // ── Delete a doctor, cancelling ──
    const cPaid = await appt(doctorC.id, { paymentMethod: "ONLINE", paymentStatus: "PAID" });
    r = await call("DELETE", `/api/admin/doctors/${doctorC.id}`);
    check("delete asks for the impact step", r.status === 409 && r.json.impact?.count === 1, `${r.status}`);
    check("not deleted yet", !(await prisma.user.findUniqueOrThrow({ where: { id: doctorC.id } })).deletedAt, "live");
    r = await call("DELETE", `/api/admin/doctors/${doctorC.id}`, { bookingAction: "CANCEL", confirmBookingIds: [cPaid.id] });
    check("confirmed delete", r.status === 200 && r.json.bookings?.cancelled === 1 && r.json.bookings?.refundTotal === 300
      && !!(await prisma.user.findUniqueOrThrow({ where: { id: doctorC.id } })).deletedAt, `${r.status} ${JSON.stringify(r.json.bookings)}`);

    // In-progress visit blocks before anything moves.
    const doctorD = await mk("DOCTOR", { doctorProfile: { create: { ...bookable, offersVideo: true } } });
    const arrived = await appt(doctorD.id, { consultType: "HOME", travelStatus: "ARRIVED", scheduledAt: new Date(Date.now() - 30 * 60_000) }, homePatient.id);
    const dFuture = await appt(doctorD.id, {}, homePatient.id);
    r = await call("DELETE", `/api/admin/doctors/${doctorD.id}`, { bookingAction: "REASSIGN", confirmBookingIds: [dFuture.id] });
    check("visit in progress blocks deletion, nothing moved",
      r.status === 409 && (await statusOf(dFuture.id)) === "SCHEDULED" && (await statusOf(arrived.id)) === "SCHEDULED", `${r.status} ${r.json.error}`);

    // ── Nurse ──
    const nb = await appt(nurse.id, { providerType: "NURSE", consultType: "HOME", paymentMethod: "ONLINE", paymentStatus: "PAID" }, homePatient.id);
    r = await call("PATCH", `/api/admin/nurses/${nurse.id}`, { status: "SUSPENDED" });
    check("nurse suspend asks, no reassign offered", r.status === 409 && r.json.impact?.count === 1 && r.json.impact?.canReassign === false, `${r.status}`);
    r = await call("PATCH", `/api/admin/nurses/${nurse.id}`, { status: "SUSPENDED", bookingAction: "REASSIGN", confirmBookingIds: [nb.id] });
    check("nurse reassign rejected", r.status === 400, `${r.status}`);
    r = await call("PATCH", `/api/admin/nurses/${nurse.id}`, { status: "SUSPENDED", bookingAction: "CANCEL", confirmBookingIds: [nb.id] });
    check("nurse suspended, booking cancelled + refunded", r.status === 200 && r.json.status === "SUSPENDED" && (await statusOf(nb.id)) === "CANCELLED"
      && r.json.bookings?.refundTotal === 300, `${r.status} ${JSON.stringify(r.json.bookings)}`);
    r = await call("PATCH", `/api/admin/nurses/${nurse.id}`, { status: "SUSPENDED" });
    check("repeat nurse suspend is a no-op", r.status === 200 && r.json.bookings === null, `${r.status}`);
    r = await call("DELETE", `/api/admin/nurses/${nurseIdle.id}`);
    check("nurse delete (no bookings)", r.status === 200 && !!(await prisma.user.findUniqueOrThrow({ where: { id: nurseIdle.id } })).deletedAt, `${r.status}`);
    r = await call("DELETE", `/api/admin/nurses/${nurseIdle.id}`);
    check("deleted nurse → 404", r.status === 404, `${r.status}`);

    // ── Patients ──
    r = await call("DELETE", `/api/admin/patients/${walletPatient.id}`);
    check("patient with wallet money asks first", r.status === 409 && r.json.impact?.walletBalance === 50 && r.json.impact?.count === 0, `${r.status}`);
    r = await call("DELETE", `/api/admin/patients/${walletPatient.id}`, { confirmBookingIds: [] });
    check("confirmed: deleted, balance reported for manual payout", r.status === 200 && r.json.walletBalance === 50, `${r.status} ${r.json.walletBalance}`);

    const pb = await appt(doctorB.id, { paymentMethod: "ONLINE", paymentStatus: "PAID" });
    r = await call("DELETE", `/api/admin/patients/${patient.id}`);
    const pImpact = r.json.impact;
    // 3 reassigned requests + pb + the past visit nobody closed (deletion
    // cancels every live booking, so the review shows it too).
    check("patient impact lists every live booking, with provider names",
      r.status === 409 && pImpact?.count === 5 && pImpact.bookings.some((b: { id: string }) => b.id === past.id)
        && pImpact.bookings.every((b: { providerName: string }) => b.providerName.startsWith("Dr.")) && pImpact.walletBalance === 850 // 550 reassignment credits + 300 from doctor C's deletion
        && pImpact.refundTotal === 600,
      `${r.status} count ${pImpact?.count} refund ${pImpact?.refundTotal}`);
    r = await call("DELETE", `/api/admin/patients/${patient.id}`, { confirmBookingIds: pImpact.bookings.map((b: { id: string }) => b.id) });
    check("confirmed patient delete: exactly the reviewed bookings, wallet reported",
      r.status === 200 && r.json.bookings?.cancelled === 5 && r.json.bookings?.refundTotal === 600 && r.json.walletBalance === 1450,
      `${r.status} ${JSON.stringify(r.json.bookings)} wallet ${r.json.walletBalance}`);
    check("patient's bookings cancelled", (await statusOf(pb.id)) === "CANCELLED", await statusOf(pb.id));
  } finally {
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
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
