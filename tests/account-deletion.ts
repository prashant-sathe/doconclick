// In-app "Delete my account" (DELETE /api/auth/account): password re-auth,
// open bookings cancelled + refunded, then soft-delete + anonymize via
// src/lib/userDeletion.ts. Runs against a live dev server (npm run dev) and
// the DB in .env, using only throwaway users that are removed afterwards.
//
//   npm run test:account-deletion        (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const PASSWORD = "test-pass-123";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(u: U, method: string, path: string, body?: unknown, extraCookie = "") {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookieFor(u) + extraCookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})), setCookie: res.headers.get("set-cookie") ?? "" };
}

async function main() {
  const stamp = String(Date.now()).slice(-9);
  const hash = await hashPassword(PASSWORD);
  const ids: string[] = [];
  const mk = async (data: Parameters<typeof prisma.user.create>[0]["data"]) => {
    const u = await prisma.user.create({ data: { password: hash, ...data } });
    ids.push(u.id);
    return u;
  };

  const patient = await mk({
    name: "Del Test Patient", mobile: "61" + stamp.slice(1), email: `del-${stamp}@example.test`, role: "PATIENT",
    patientProfile: { create: { age: 30, gender: "Male", homeAddress: "12 Test Lane", emergencyContactPhone: "9000000000", allergies: "Peanuts" } },
  });
  const otherPatient = await mk({
    name: "Del Test Patient 2", mobile: "62" + stamp.slice(1), role: "PATIENT",
    patientProfile: { create: { age: 40, gender: "Female" } },
  });
  const doctor = await mk({
    name: "Del Test Doctor", mobile: "91" + stamp.slice(1), role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", medRegNo: `TESTREG${stamp}`, bio: "Bio", kycDocUrl: "https://x/kyc.pdf", lat: 18.5, lng: 73.8 } },
  });
  const staff = await mk({ name: "Del Test Staff", mobile: "81" + stamp.slice(1), role: "STAFF" });
  await prisma.staffProfile.create({ data: { userId: staff.id, doctorId: doctor.id } });
  const nurse = await mk({ name: "Del Test Nurse", mobile: "71" + stamp.slice(1), role: "NURSE", nurseProfile: { create: { status: "APPROVED", address: "Nurse St" } } });
  const coupon = await prisma.coupon.create({ data: { code: `DELTEST${stamp}`, discountType: "FLAT", discountValue: 50, usedCount: 1 } });

  const appt = (data: Record<string, unknown>) =>
    prisma.appointment.create({ data: { symptoms: "test", patientId: patient.id, doctorId: doctor.id, amount: 500, ...data } as never });

  try {
    // ── Patient deletes their own account ──
    const paid = await appt({ status: "SCHEDULED", paymentMethod: "ONLINE", paymentStatus: "PAID", discountAmount: 100 });
    const unpaid = await appt({ status: "PENDING_APPROVAL", couponId: coupon.id, couponCode: coupon.code, discountAmount: 50 });
    await prisma.couponRedemption.create({ data: { couponId: coupon.id, userId: patient.id, appointmentId: unpaid.id, discountAmount: 50 } });
    const done = await appt({ status: "COMPLETED", paymentStatus: "PAID", consultType: "HOME", visitAddress: "12 Test Lane", visitLat: 18.5, visitLng: 73.8 });
    await prisma.wallet.create({ data: { userId: patient.id, balance: 25 } });
    await prisma.patientDocument.create({ data: { patientId: patient.id, title: "Old report", fileUrl: "https://x/r.pdf" } });
    await prisma.vitalReading.create({ data: { patientId: patient.id, recordedById: patient.id, pulse: 70 } });
    await prisma.pushToken.create({ data: { userId: patient.id, token: `deltest-${stamp}` } });

    let r = await call(patient, "GET", "/api/auth/account");
    check("preview", r.status === 200 && r.json.openBookings === 2 && r.json.refundTotal === 400 && r.json.walletBalanceAfter === 425 && r.json.blocker === null,
      JSON.stringify(r.json));

    r = await call(patient, "DELETE", "/api/auth/account", {});
    check("no password", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(patient, "DELETE", "/api/auth/account", { password: "wrong" });
    check("wrong password", r.status === 400 && r.json.code === "WRONG_PASSWORD", `${r.status} ${r.json.error}`);
    r = await call(patient, "DELETE", "/api/auth/account", { password: PASSWORD }, "; doconclick_impersonator_token=x");
    check("blocked while impersonating", r.status === 400, `${r.status} ${r.json.error}`);
    check("still live after rejected attempts", !(await prisma.user.findUniqueOrThrow({ where: { id: patient.id } })).deletedAt, "deletedAt null");

    r = await call(patient, "DELETE", "/api/auth/account", { password: PASSWORD });
    check("patient delete", r.status === 200 && r.json.cancelledBookings === 2 && r.json.refundTotal === 400, `${r.status} ${JSON.stringify(r.json)}`);
    check("session cookie cleared", /doconclick_token=;/.test(r.setCookie), r.setCookie.slice(0, 60));

    const statuses = await prisma.appointment.findMany({ where: { id: { in: [paid.id, unpaid.id, done.id] } }, select: { id: true, status: true } });
    const st = Object.fromEntries(statuses.map((a) => [a.id, a.status]));
    check("open bookings cancelled, completed kept", st[paid.id] === "CANCELLED" && st[unpaid.id] === "CANCELLED" && st[done.id] === "COMPLETED", JSON.stringify(st));
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: patient.id }, include: { transactions: true } });
    check("paid booking refunded to wallet", wallet.balance === 425 && wallet.transactions.some((t) => t.refundOfAppointmentId === paid.id && t.amount === 400 && t.type === "CANCELLATION_REFUND"),
      `balance ${wallet.balance}`);
    const c = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    const red = await prisma.couponRedemption.count({ where: { appointmentId: unpaid.id } });
    check("unpaid booking's coupon released", c.usedCount === 0 && red === 0, `usedCount ${c.usedCount}, redemptions ${red}`);

    const gone = await prisma.user.findUniqueOrThrow({ where: { id: patient.id }, include: { patientProfile: true } });
    check("patient anonymized",
      !!gone.deletedAt && gone.name === "Deleted user" && gone.mobile === `deleted_${patient.id}` && gone.email === null && gone.password === ""
        && gone.patientProfile?.homeAddress === null && gone.patientProfile?.emergencyContactPhone === null && gone.patientProfile?.allergies === null,
      `${gone.name} / ${gone.mobile} / ${gone.email}`);
    const leftovers = {
      docs: await prisma.patientDocument.count({ where: { patientId: patient.id } }),
      vitals: await prisma.vitalReading.count({ where: { patientId: patient.id } }),
      tokens: await prisma.pushToken.count({ where: { userId: patient.id } }),
    };
    const doneRow = await prisma.appointment.findUniqueOrThrow({ where: { id: done.id } });
    check("visit address cleared from kept bookings", doneRow.status === "COMPLETED" && doneRow.visitAddress === null && doneRow.visitLat === null,
      `${doneRow.status}, ${doneRow.visitAddress}`);
    check("documents, self-logged vitals, push tokens removed", Object.values(leftovers).every((n) => n === 0), JSON.stringify(leftovers));
    r = await call(patient, "GET", "/api/auth/me");
    check("old session rejected", r.status === 401, `${r.status}`);
    const reused = await prisma.user.create({ data: { name: "Reuse", mobile: patient.mobile, email: patient.email, role: "PATIENT" } });
    ids.push(reused.id);
    check("mobile/email free for re-registration", true, "created");

    // ── Doctor: in-progress visit blocks, rolls back cleanly ──
    const docPaid = await prisma.appointment.create({
      data: { symptoms: "t", patientId: otherPatient.id, doctorId: doctor.id, amount: 300, status: "SCHEDULED", paymentMethod: "ONLINE", paymentStatus: "PAID" },
    });
    const arrived = await prisma.appointment.create({
      data: { symptoms: "t", patientId: otherPatient.id, doctorId: doctor.id, amount: 200, status: "SCHEDULED", consultType: "HOME", travelStatus: "ARRIVED" },
    });
    r = await call(doctor, "GET", "/api/auth/account");
    check("doctor preview shows blocker", r.status === 200 && !!r.json.blocker, JSON.stringify(r.json));
    r = await call(doctor, "DELETE", "/api/auth/account", { password: PASSWORD });
    const stillLive = await prisma.user.findUniqueOrThrow({ where: { id: doctor.id } });
    const docPaidRow = await prisma.appointment.findUniqueOrThrow({ where: { id: docPaid.id } });
    check("in-progress visit blocks deletion, nothing changed", r.status === 409 && !stillLive.deletedAt && docPaidRow.status === "SCHEDULED",
      `${r.status} ${r.json.error}`);

    await prisma.appointment.update({ where: { id: arrived.id }, data: { status: "COMPLETED" } });
    r = await call(doctor, "DELETE", "/api/auth/account", { password: PASSWORD });
    check("doctor delete", r.status === 200 && r.json.cancelledBookings === 1 && r.json.refundTotal === 300, `${r.status} ${JSON.stringify(r.json)}`);
    const otherWallet = await prisma.wallet.findUnique({ where: { userId: otherPatient.id } });
    check("doctor's patient refunded", otherWallet?.balance === 300, `balance ${otherWallet?.balance}`);
    const doc = await prisma.user.findUniqueOrThrow({ where: { id: doctor.id }, include: { doctorProfile: true } });
    check("doctor anonymized, professional identity kept",
      doc.name === "Del Test Doctor" && doc.mobile === `deleted_${doctor.id}` && doc.doctorProfile?.medRegNo === `TESTREG${stamp}`
        && doc.doctorProfile?.bio === null && doc.doctorProfile?.kycDocUrl === null && doc.doctorProfile?.lat === null,
      `${doc.name} / reg ${doc.doctorProfile?.medRegNo} / bio ${doc.doctorProfile?.bio}`);
    const staffRow = await prisma.user.findUniqueOrThrow({ where: { id: staff.id }, include: { staffAccount: true } });
    check("doctor's staff deleted too", !!staffRow.deletedAt && staffRow.staffAccount?.active === false && staffRow.mobile === `deleted_${staff.id}`, staffRow.mobile);
    r = await call(otherPatient, "POST", "/api/appointments", { doctorId: doctor.id, symptoms: "x", consultType: "VIDEO", consentGiven: true });
    check("can't book a deleted doctor", r.status === 404, `${r.status} ${r.json.error}`);

    // ── Nurse ──
    const nb = await prisma.appointment.create({
      data: { symptoms: "t", patientId: otherPatient.id, doctorId: nurse.id, providerType: "NURSE", consultType: "HOME", amount: 400, status: "PENDING_APPROVAL" },
    });
    r = await call(nurse, "DELETE", "/api/auth/account", { password: PASSWORD });
    const nbRow = await prisma.appointment.findUniqueOrThrow({ where: { id: nb.id } });
    const n = await prisma.user.findUniqueOrThrow({ where: { id: nurse.id }, include: { nurseProfile: true } });
    check("nurse delete", r.status === 200 && nbRow.status === "CANCELLED" && !!n.deletedAt && n.nurseProfile?.address === null, `${r.status}, booking ${nbRow.status}`);

    // ── Roles and races ──
    const staff2 = await mk({ name: "Del Test Staff 2", mobile: "82" + stamp.slice(1), role: "STAFF" });
    r = await call(staff2, "DELETE", "/api/auth/account", { password: PASSWORD });
    check("staff can't self-delete", r.status === 403, `${r.status}`);

    const racer = await mk({ name: "Del Test Racer", mobile: "63" + stamp.slice(1), role: "PATIENT" });
    const raced = await Promise.all(Array.from({ length: 4 }, () => call(racer, "DELETE", "/api/auth/account", { password: PASSWORD })));
    const codes = raced.map((x) => x.status);
    check("4 concurrent deletes → exactly one succeeds", codes.filter((x) => x === 200).length === 1, codes.join(","));
  } finally {
    await prisma.couponRedemption.deleteMany({ where: { userId: { in: ids } } });
    await prisma.coupon.deleteMany({ where: { id: coupon.id } });
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.vitalReading.deleteMany({ where: { patientId: { in: ids } } });
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
