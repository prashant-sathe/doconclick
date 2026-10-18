// Clinic leave days (POST /api/doctors/me/clinics/:id/leaves): real
// today-or-later IST dates only; live bookings at that clinic on that IST day
// come back for confirmation, then are cancelled + refunded (netPayable to the
// wallet, or coupon freed) through the shared cancel path, each patient pushed.
// Runs against a live dev server and the DB in .env, throwaway users only.
//
// Push checks count "sendPushToUsers failed" lines in the dev log, so start
// the server with Firebase blanked and point DEV_LOG at its output (see
// tests/admin-doctor-status.ts); without DEV_LOG they're skipped.
//
//   DEV_LOG=/tmp/next-dev.log npm run test:clinic-leave
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DEV_LOG = process.env.DEV_LOG;
const DAY = 24 * 60 * 60 * 1000;
const IST = 5.5 * 60 * 60 * 1000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}
const pushAttempts = () => (DEV_LOG ? (fs.readFileSync(DEV_LOG, "utf8").match(/sendPushToUsers failed/g) ?? []).length : 0);

// IST calendar date `days` from today, and an instant at hh:mm IST on it.
const istDate = (days: number) => new Date(Date.now() + IST + days * DAY).toISOString().slice(0, 10);
const atIst = (date: string, hh: number, mm = 0) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST);
};

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const doctorProfile = { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY) } };
  const doctor = await prisma.user.create({ data: { name: "Leave Test Doctor", mobile: `9${stamp}1`, role: "DOCTOR", doctorProfile } });
  const otherDoctor = await prisma.user.create({ data: { name: "Leave Test Other", mobile: `9${stamp}2`, role: "DOCTOR", doctorProfile } });
  const patient = await prisma.user.create({
    data: { name: "Leave Test Patient", mobile: `6${stamp}1`, role: "PATIENT", pushTokens: { create: { token: `leave-test-${stamp}` } } },
  });
  const ids = [doctor.id, otherDoctor.id, patient.id];
  const clinicData = (name: string) => ({ doctorId: doctor.id, name, address: "Test Rd", lat: 18.5, lng: 73.8 });
  const clinic = await prisma.clinic.create({ data: clinicData("Leave Clinic A") });
  const clinicB = await prisma.clinic.create({ data: clinicData("Leave Clinic B") });
  const coupon = await prisma.coupon.create({ data: { code: `LEAVETEST${stamp}`, discountType: "FLAT", discountValue: 50, usedCount: 1 } });

  const cookieFor = (u: { id: string; name: string; role: string; mobile: string }) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
  const post = async (body: unknown, as = doctor, clinicId = clinic.id) => {
    const res = await fetch(`${BASE}/api/doctors/me/clinics/${clinicId}/leaves`, {
      method: "POST",
      headers: { Cookie: cookieFor(as), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const appt = (data: Record<string, unknown>) =>
    prisma.appointment.create({
      data: { patientId: patient.id, doctorId: doctor.id, clinicId: clinic.id, symptoms: "t", consultType: "CLINIC", amount: 500, status: "SCHEDULED", ...data } as never,
    });

  try {
    // ── Date validation ──
    const cases: [string, unknown][] = [
      ["impossible date", "2026-02-31"],
      ["month 13", "2026-13-01"],
      ["not a date", "next friday"],
      ["missing", undefined],
      ["yesterday (IST)", istDate(-1)],
      ["over a year ahead", istDate(400)],
    ];
    for (const [label, date] of cases) {
      const r = await post({ date });
      check(`rejects ${label}`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    let r = await post({ date: istDate(0), reason: "x".repeat(201) });
    check("rejects over-long reason", r.status === 400, `${r.status}`);
    r = await post({ date: istDate(0) }, otherDoctor);
    check("other doctor's clinic → 404", r.status === 404, `${r.status}`);

    r = await post({ date: istDate(0) });
    check("today (IST) with no bookings", r.status === 200 && r.json.cancelledBookings === 0, `${r.status} ${JSON.stringify(r.json).slice(0, 80)}`);
    r = await post({ date: istDate(0) });
    check("duplicate date", r.status === 409 && !r.json.code, `${r.status} ${r.json.error}`);

    // ── A day with bookings ──
    const day = istDate(3);
    const paid = await appt({ scheduledAt: atIst(day, 10), paymentMethod: "ONLINE", paymentStatus: "PAID", discountAmount: 100 });
    const unpaid = await appt({ scheduledAt: atIst(day, 11), status: "PENDING_APPROVAL", couponId: coupon.id, couponCode: coupon.code, discountAmount: 50 });
    await prisma.couponRedemption.create({ data: { couponId: coupon.id, userId: patient.id, appointmentId: unpaid.id, discountAmount: 50 } });
    const lateNight = await appt({ scheduledAt: atIst(day, 23, 45) });
    const nextDay = await appt({ scheduledAt: atIst(istDate(4), 0, 10) });
    const otherClinic = await appt({ scheduledAt: atIst(day, 10, 30), clinicId: clinicB.id });
    const done = await appt({ scheduledAt: atIst(day, 9), status: "COMPLETED" });
    const expected = [paid.id, unpaid.id, lateNight.id];

    r = await post({ date: day, reason: "Conference" });
    const listed = (r.json.bookings ?? []) as { id: string; refund: number; paid: boolean }[];
    check("first call asks to confirm", r.status === 409 && r.json.code === "LEAVE_HAS_BOOKINGS", `${r.status} ${r.json.code}`);
    check("lists exactly that clinic's live bookings that IST day",
      listed.map((b) => b.id).join() === expected.join(),
      `${listed.length} listed`);
    check("refund preview", listed[0]?.refund === 400 && listed[0]?.paid && listed[1]?.refund === 0, JSON.stringify(listed.map((b) => b.refund)));
    check("nothing written yet", !(await prisma.clinicLeave.findFirst({ where: { clinicId: clinic.id, date: day } })), "no leave row");

    r = await post({ date: day, confirmBookingIds: expected.slice(0, 2) });
    check("partial confirmation asks again", r.status === 409 && r.json.code === "LEAVE_HAS_BOOKINGS", `${r.status}`);

    // A booking lands after the doctor saw the list.
    const latecomer = await appt({ scheduledAt: atIst(day, 15) });
    r = await post({ date: day, confirmBookingIds: expected });
    check("new booking since preview asks again", r.status === 409 && (r.json.bookings as { id: string }[]).some((b) => b.id === latecomer.id), `${r.status}`);

    // The latecomer is cancelled by its patient and another paid one is
    // booked; a fresh preview reflects both.
    await prisma.appointment.update({ where: { id: latecomer.id }, data: { status: "CANCELLED" } });
    const racer = await appt({ scheduledAt: atIst(day, 16), paymentMethod: "ONLINE", paymentStatus: "PAID" });
    r = await post({ date: day });
    const fresh = (r.json.bookings as { id: string }[]).map((b) => b.id);
    check("fresh preview reflects changes", !fresh.includes(latecomer.id) && fresh.includes(racer.id) && fresh.length === 4, `${fresh.length} listed`);

    const before = pushAttempts();
    r = await post({ date: day, reason: "Conference", confirmBookingIds: fresh });
    await new Promise((res) => setTimeout(res, 1000));
    check("confirmed: leave added", r.status === 200 && r.json.cancelledBookings === 4 && r.json.refundTotal === 900,
      `${r.status} ${JSON.stringify({ c: r.json.cancelledBookings, t: r.json.refundTotal, e: r.json.error })}`);

    const st = Object.fromEntries((await prisma.appointment.findMany({
      where: { id: { in: [paid.id, unpaid.id, lateNight.id, racer.id, nextDay.id, otherClinic.id, done.id] } },
      select: { id: true, status: true },
    })).map((a) => [a.id, a.status]));
    check("that day's live bookings cancelled",
      [paid.id, unpaid.id, lateNight.id, racer.id].every((id) => st[id] === "CANCELLED"), JSON.stringify([st[paid.id], st[unpaid.id], st[lateNight.id], st[racer.id]]));
    check("next day / other clinic / completed untouched",
      st[nextDay.id] === "SCHEDULED" && st[otherClinic.id] === "SCHEDULED" && st[done.id] === "COMPLETED", JSON.stringify([st[nextDay.id], st[otherClinic.id], st[done.id]]));
    const wallet = await prisma.wallet.findUnique({ where: { userId: patient.id }, include: { transactions: true } });
    check("paid bookings refunded netPayable to wallet",
      wallet?.balance === 900 && wallet.transactions.filter((t) => t.type === "CANCELLATION_REFUND").length === 2,
      `balance ${wallet?.balance}`);
    const c = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    check("unpaid booking's coupon released", c.usedCount === 0, `usedCount ${c.usedCount}`);
    if (DEV_LOG) check("one push per cancelled booking", pushAttempts() - before === 4, `${pushAttempts() - before} push(es)`);
    else console.log("SKIP  pushes — DEV_LOG not set");

    // ── A booking that closes between preview and confirm rolls everything back ──
    const day2 = istDate(5);
    const a1 = await appt({ scheduledAt: atIst(day2, 10), paymentMethod: "ONLINE", paymentStatus: "PAID" });
    const a2 = await appt({ scheduledAt: atIst(day2, 11), paymentMethod: "ONLINE", paymentStatus: "PAID" });
    const preview = await post({ date: day2 });
    const previewIds = (preview.json.bookings as { id: string }[]).map((b) => b.id);
    // Patient cancels a2 through the real route at the same moment the doctor confirms.
    const [confirmRes] = await Promise.all([
      post({ date: day2, confirmBookingIds: previewIds }),
      fetch(`${BASE}/api/appointments/${a2.id}`, {
        method: "PATCH",
        headers: { Cookie: cookieFor(patient), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      }),
    ]);
    const a1Row = await prisma.appointment.findUniqueOrThrow({ where: { id: a1.id } });
    const a2Row = await prisma.appointment.findUniqueOrThrow({ where: { id: a2.id } });
    const refunds = await prisma.walletTransaction.count({ where: { refundOfAppointmentId: { in: [a1.id, a2.id] } } });
    const leaveRow = await prisma.clinicLeave.findFirst({ where: { clinicId: clinic.id, date: day2 } });
    check("racing patient cancel: each booking refunded exactly once",
      a2Row.status === "CANCELLED" && refunds === (a1Row.status === "CANCELLED" ? 2 : 1),
      `confirm ${confirmRes.status}, a1 ${a1Row.status}, refunds ${refunds}`);
    check("racing patient cancel: all-or-nothing",
      (confirmRes.status === 200 && !!leaveRow && a1Row.status === "CANCELLED")
        || (confirmRes.status === 409 && !leaveRow && a1Row.status === "SCHEDULED"),
      `confirm ${confirmRes.status} ${confirmRes.json.error ?? ""}, leave ${leaveRow ? "added" : "not added"}`);
  } finally {
    await prisma.couponRedemption.deleteMany({ where: { userId: patient.id } });
    await prisma.coupon.deleteMany({ where: { id: coupon.id } });
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
