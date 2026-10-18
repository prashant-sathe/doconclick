// Deleting / deactivating a clinic (DELETE + PATCH /api/doctors/me/clinics/:id):
// soft delete only (row kept with deletedAt + isActive false, so past visits
// keep their clinic); open bookings — future scheduled visits and pending
// requests — must be confirmed first, then are cancelled + refunded through
// the shared cancel path and each patient pushed.
// Runs against a live dev server and the DB in .env, throwaway users only.
//
// Push checks count "sendPushToUsers failed" lines in the dev log, so start
// the server with Firebase blanked and point DEV_LOG at its output (see
// tests/admin-doctor-status.ts); without DEV_LOG they're skipped.
//
//   DEV_LOG=/tmp/next-dev.log npm run test:clinic-close
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
const settle = () => new Promise((r) => setTimeout(r, 1000));

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const doctor = await prisma.user.create({
    data: {
      name: "Close Test Doctor", mobile: `9${stamp}1`, role: "DOCTOR",
      doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY), consultFee: 300 } },
    },
  });
  const patient = await prisma.user.create({
    data: {
      name: "Close Test Patient", mobile: `6${stamp}1`, role: "PATIENT",
      patientProfile: { create: { age: 30, gender: "Male" } },
      pushTokens: { create: { token: `close-test-${stamp}` } },
    },
  });
  const ids = [doctor.id, patient.id];
  const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayOfWeek) => ({ dayOfWeek, fromTime: "00:00", toTime: "23:59" }));
  const mkClinic = (name: string) =>
    prisma.clinic.create({ data: { doctorId: doctor.id, name, address: "Test Rd", lat: 18.5, lng: 73.8, slots: { create: allDays } } });

  const cookieFor = (u: { id: string; name: string; role: string; mobile: string }) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
  const call = async (method: string, path: string, body?: unknown, as: { id: string; name: string; role: string; mobile: string } = doctor) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookieFor(as), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const patchBody = (extra: Record<string, unknown>) => ({ name: "Edited", address: "Test Rd", lat: 18.5, lng: 73.8, slots: allDays, ...extra });
  let minute = 0;
  // Distinct minutes, so the one-live-booking-per-start-time index never trips.
  const appt = (clinicId: string, data: Record<string, unknown>) =>
    prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: doctor.id, clinicId, symptoms: "t", consultType: "CLINIC", amount: 500, status: "SCHEDULED",
        scheduledAt: new Date(Date.now() + 2 * DAY + ++minute * 60_000), ...data,
      } as never,
    });

  try {
    // ── No open bookings: plain soft delete ──
    const empty = await mkClinic("Close Clinic Empty");
    const pastVisit = await appt(empty.id, { status: "COMPLETED", scheduledAt: new Date(Date.now() - 3 * DAY) });
    let r = await call("DELETE", `/api/doctors/me/clinics/${empty.id}`);
    const emptyRow = await prisma.clinic.findUnique({ where: { id: empty.id } });
    check("delete without bookings", r.status === 200 && r.json.cancelledBookings === 0, `${r.status}`);
    check("soft-deleted, not removed", !!emptyRow?.deletedAt && emptyRow.isActive === false, `deletedAt ${emptyRow?.deletedAt ? "set" : "null"}, isActive ${emptyRow?.isActive}`);
    const pastRow = await prisma.appointment.findUniqueOrThrow({ where: { id: pastVisit.id } });
    check("past visit keeps its clinic", pastRow.clinicId === empty.id, `${pastRow.clinicId}`);
    const mine = (await call("GET", "/api/doctors/me/clinics")).json as { id: string }[];
    check("hidden from the doctor's clinic list", !mine.some((c) => c.id === empty.id), `${mine.length} listed`);
    r = await call("PATCH", `/api/doctors/me/clinics/${empty.id}`, patchBody({}));
    check("deleted clinic can't be edited", r.status === 404, `${r.status}`);
    r = await call("DELETE", `/api/doctors/me/clinics/${empty.id}`);
    check("deleted clinic can't be re-deleted", r.status === 404, `${r.status}`);
    r = await call("POST", `/api/doctors/me/clinics/${empty.id}/leaves`, { date: new Date(Date.now() + 5.5 * 3600_000 + 2 * DAY).toISOString().slice(0, 10) });
    check("deleted clinic can't get leave days", r.status === 404, `${r.status}`);
    r = await call("POST", "/api/appointments", { doctorId: doctor.id, clinicId: empty.id, symptoms: "x", consultType: "CLINIC", consentGiven: true }, patient);
    check("patients can't book a deleted clinic", r.status === 400, `${r.status} ${r.json.error}`);

    // ── Open bookings: confirm, then cancel + refund ──
    const clinic = await mkClinic("Close Clinic A");
    const other = await mkClinic("Close Clinic B");
    const futurePaid = await appt(clinic.id, { paymentMethod: "ONLINE", paymentStatus: "PAID", discountAmount: 100 });
    const pendingNow = await appt(clinic.id, { status: "PENDING_APPROVAL", scheduledAt: new Date(Date.now() - 10 * 60_000) });
    const pastOpen = await appt(clinic.id, { scheduledAt: new Date(Date.now() - 2 * DAY), paymentMethod: "ONLINE", paymentStatus: "PAID" });
    const otherClinic = await appt(other.id, {});
    const expected = [pendingNow.id, futurePaid.id];

    r = await call("DELETE", `/api/doctors/me/clinics/${clinic.id}`);
    const listed = ((r.json.bookings ?? []) as { id: string; refund: number }[]);
    check("delete asks to confirm", r.status === 409 && r.json.code === "CLINIC_HAS_BOOKINGS", `${r.status} ${r.json.code}`);
    check("lists future scheduled + pending, not past or other clinic",
      [...listed.map((b) => b.id)].sort().join() === [...expected].sort().join(), `${listed.length} listed`);
    check("refund preview", listed.find((b) => b.id === futurePaid.id)?.refund === 400, JSON.stringify(listed.map((b) => b.refund)));
    check("nothing written yet", !(await prisma.clinic.findUniqueOrThrow({ where: { id: clinic.id } })).deletedAt, "deletedAt null");
    r = await call("DELETE", `/api/doctors/me/clinics/${clinic.id}`, { confirmBookingIds: [futurePaid.id] });
    check("partial confirmation asks again", r.status === 409 && r.json.code === "CLINIC_HAS_BOOKINGS", `${r.status}`);

    const before = pushAttempts();
    r = await call("DELETE", `/api/doctors/me/clinics/${clinic.id}`, { confirmBookingIds: expected });
    await settle();
    check("confirmed delete", r.status === 200 && r.json.cancelledBookings === 2 && r.json.refundTotal === 400, `${r.status} ${JSON.stringify(r.json)}`);
    const st = Object.fromEntries((await prisma.appointment.findMany({
      where: { id: { in: [futurePaid.id, pendingNow.id, pastOpen.id, otherClinic.id] } }, select: { id: true, status: true, clinicId: true },
    })).map((a) => [a.id, a]));
    check("open bookings cancelled", st[futurePaid.id].status === "CANCELLED" && st[pendingNow.id].status === "CANCELLED",
      `${st[futurePaid.id].status}, ${st[pendingNow.id].status}`);
    check("past open visit and other clinic untouched",
      st[pastOpen.id].status === "SCHEDULED" && st[pastOpen.id].clinicId === clinic.id && st[otherClinic.id].status === "SCHEDULED",
      `${st[pastOpen.id].status}, ${st[otherClinic.id].status}`);
    const wallet = await prisma.wallet.findUnique({ where: { userId: patient.id } });
    check("paid booking refunded netPayable", wallet?.balance === 400, `balance ${wallet?.balance}`);
    if (DEV_LOG) check("one push per cancelled booking", pushAttempts() - before === 2, `${pushAttempts() - before} push(es)`);
    else console.log("SKIP  pushes — DEV_LOG not set");
    check("clinic soft-deleted", !!(await prisma.clinic.findUniqueOrThrow({ where: { id: clinic.id } })).deletedAt, "deletedAt set");

    // ── Deactivating via PATCH ──
    const toggled = await appt(other.id, { paymentMethod: "ONLINE", paymentStatus: "PAID" });
    r = await call("PATCH", `/api/doctors/me/clinics/${other.id}`, patchBody({}));
    check("ordinary edit with bookings goes through", r.status === 200 && r.json.isActive === true && !r.json.cancelledBookings, `${r.status}`);
    r = await call("PATCH", `/api/doctors/me/clinics/${other.id}`, patchBody({ isActive: false }));
    check("deactivate asks to confirm", r.status === 409 && r.json.code === "CLINIC_HAS_BOOKINGS" && r.json.bookings.length === 2, `${r.status} ${r.json.bookings?.length}`);
    check("still active until confirmed", (await prisma.clinic.findUniqueOrThrow({ where: { id: other.id } })).isActive, "isActive true");
    r = await call("PATCH", `/api/doctors/me/clinics/${other.id}`, patchBody({ isActive: false, confirmBookingIds: [otherClinic.id, toggled.id] }));
    const otherRow = await prisma.clinic.findUniqueOrThrow({ where: { id: other.id } });
    check("confirmed deactivate", r.status === 200 && r.json.cancelledBookings === 2 && !otherRow.isActive && !otherRow.deletedAt && otherRow.name === "Edited",
      `${r.status}, isActive ${otherRow.isActive}, name ${otherRow.name}`);

    // ── A patient cancelling mid-confirm: no 500, refunded once ──
    const raceClinic = await mkClinic("Close Clinic Race");
    const a1 = await appt(raceClinic.id, { paymentMethod: "ONLINE", paymentStatus: "PAID" });
    const a2 = await appt(raceClinic.id, { paymentMethod: "ONLINE", paymentStatus: "PAID" });
    const [del] = await Promise.all([
      call("DELETE", `/api/doctors/me/clinics/${raceClinic.id}`, { confirmBookingIds: [a1.id, a2.id] }),
      call("PATCH", `/api/appointments/${a2.id}`, { status: "CANCELLED" }, patient),
    ]);
    const refunds = await prisma.walletTransaction.count({ where: { refundOfAppointmentId: { in: [a1.id, a2.id] } } });
    const a1Row = await prisma.appointment.findUniqueOrThrow({ where: { id: a1.id } });
    const raceRow = await prisma.clinic.findUniqueOrThrow({ where: { id: raceClinic.id } });
    check("race: no server error", del.status === 200 || del.status === 409, `${del.status} ${del.json.error ?? ""}`);
    check("race: all-or-nothing, each refunded once",
      (del.status === 200 && !!raceRow.deletedAt && a1Row.status === "CANCELLED" && refunds === 2)
        || (del.status === 409 && !raceRow.deletedAt && a1Row.status === "SCHEDULED" && refunds === 1),
      `${del.status}, deleted ${!!raceRow.deletedAt}, a1 ${a1Row.status}, refunds ${refunds}`);
  } finally {
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: patient.id } } });
    await prisma.wallet.deleteMany({ where: { userId: patient.id } });
    await prisma.appointment.deleteMany({ where: { patientId: patient.id } });
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
