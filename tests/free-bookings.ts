// Zero-amount bookings (BUG-TRACKER #58): a booking that costs nothing (the
// provider's fee is ₹0) is marked PAID server-side the moment it's accepted —
// single accept, bulk accept and a nurse accept — so the patient never gets
// a payment step, and the provider gets no "payment received" push for it.
// A paid booking accepted alongside it stays unpaid. An older ₹0 row still
// waiting is confirmed through create-order without a gateway order. Against
// a live dev server and the DB in .env, throwaway users only. Push sends are
// counted from the dev server log (/tmp/doconclick-dev.log).
//
//   npm run test:free-bookings
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LOG = process.env.DEV_LOG ?? "/tmp/doconclick-dev.log";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}
const pushesTo = (id: string) => (fs.readFileSync(LOG, "utf8").match(new RegExp(`sendPushToUsers\\(${id}\\)`, "g")) ?? []).length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `4${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const doctor = await mk({ name: "Free Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), videoFee: 0, consultFee: 500, availability: "Sun-Sat, 12AM-11:59PM" } } });
  const nurse = await mk({ name: "Free Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED", registrationFeePaid: true, subscriptionPaidUntil: new Date(Date.now() + 30 * DAY), availability: "Sun-Sat, 12AM-11:59PM" } } });
  const patient = await mk({ name: "Free Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  await prisma.pushToken.createMany({ data: [{ userId: doctor.id, token: `free-doc-${stamp}` }, { userId: nurse.id, token: `free-nurse-${stamp}` }] });

  // Spread out so slot/clash checks never see two at the same time.
  let slot = 0;
  const when = () => new Date(Date.now() + 2 * DAY + ++slot * 2 * 60 * 60_000);
  const pending = (over: Record<string, unknown>) => prisma.appointment.create({ data: {
    doctorId: doctor.id, patientId: patient.id, symptoms: "x", consultType: "VIDEO", status: "PENDING_APPROVAL", paymentMethod: "ONLINE",
    amount: 0, platformFee: 0, scheduledAt: when(), ...over,
  } as never });
  const row = (id: string) => prisma.appointment.findUniqueOrThrow({ where: { id } });

  try {
    // ── Single accept ──
    const free = await pending({});
    const before = pushesTo(doctor.id);
    let r = await call(doctor, "PATCH", `/api/appointments/${free.id}`, { status: "SCHEDULED" });
    let a = await row(free.id);
    check("accepting a ₹0 video consult → SCHEDULED and PAID at once", r.status === 200 && a.status === "SCHEDULED" && a.paymentStatus === "PAID" && !!a.paidAt, `${r.status} ${a.status}/${a.paymentStatus} ${r.json.error ?? ""}`);
    check("…the accept response already says PAID", r.json.paymentStatus === "PAID", String(r.json.paymentStatus));
    await sleep(1500);
    check("…and the doctor gets no 'payment received' push", pushesTo(doctor.id) === before, `+${pushesTo(doctor.id) - before}`);

    const paid = await pending({ consultType: "CLINIC", amount: 500, platformFee: 75 });
    r = await call(doctor, "PATCH", `/api/appointments/${paid.id}`, { status: "SCHEDULED" });
    a = await row(paid.id);
    check("a ₹500 booking accepted the same way stays unpaid (payment step still needed)", r.status === 200 && a.status === "SCHEDULED" && a.paymentStatus === "PENDING", `${r.status} ${a.paymentStatus} ${r.json.error ?? ""}`);

    // A 100% coupon recorded at booking (discount = amount) is ₹0 too.
    const covered = await pending({ consultType: "CLINIC", amount: 500, platformFee: 75, discountAmount: 500 });
    r = await call(doctor, "PATCH", `/api/appointments/${covered.id}`, { status: "SCHEDULED" });
    check("a booking whose discount covers the fee is PAID on accept", (await row(covered.id)).paymentStatus === "PAID", `${r.status}`);

    // Declining a ₹0 request doesn't mark it paid.
    const declined = await pending({});
    await call(doctor, "PATCH", `/api/appointments/${declined.id}`, { status: "REJECTED" });
    a = await row(declined.id);
    check("declining a ₹0 request leaves it unpaid", a.status === "REJECTED" && a.paymentStatus === "PENDING", `${a.status}/${a.paymentStatus}`);

    // ── Bulk accept ──
    const b1 = await pending({});
    const b2 = await pending({ consultType: "CLINIC", amount: 500, platformFee: 75 });
    r = await call(doctor, "POST", "/api/appointments/bulk-accept");
    const [r1, r2] = [await row(b1.id), await row(b2.id)];
    check("bulk accept: the ₹0 one is PAID, the ₹500 one waits for payment", r.status === 200 && r1.status === "SCHEDULED" && r1.paymentStatus === "PAID" && r2.status === "SCHEDULED" && r2.paymentStatus === "PENDING", `${r.status} ${r1.paymentStatus} / ${r2.paymentStatus} skipped=${JSON.stringify(r.json.skipped)}`);

    // ── Nurse accept ──
    const nb = await prisma.appointment.create({ data: {
      doctorId: nurse.id, patientId: patient.id, providerType: "NURSE", consultType: "HOME", symptoms: "x", status: "PENDING_APPROVAL",
      paymentMethod: "ONLINE", amount: 0, platformFee: 0, scheduledAt: when(), serviceName: "Free check",
    } as never });
    const nBefore = pushesTo(nurse.id);
    r = await call(nurse, "PATCH", `/api/appointments/${nb.id}`, { status: "SCHEDULED" });
    a = await row(nb.id);
    check("a nurse accepting a ₹0 visit → PAID (and the visit code is still issued)", r.status === 200 && a.paymentStatus === "PAID" && !!a.visitOtp, `${r.status} ${a.paymentStatus} ${r.json.error ?? ""}`);
    await sleep(1500);
    check("…no 'payment received' push to the nurse", pushesTo(nurse.id) === nBefore, `+${pushesTo(nurse.id) - nBefore}`);

    // ── An older ₹0 row still waiting: confirmed without a gateway ──
    const legacy = await prisma.appointment.create({ data: {
      doctorId: doctor.id, patientId: patient.id, symptoms: "x", consultType: "VIDEO", status: "SCHEDULED", paymentMethod: "ONLINE",
      amount: 0, platformFee: 0, scheduledAt: when(), acceptedAt: new Date(),
    } as never });
    r = await call(patient, "POST", "/api/payments/create-order", { appointmentId: legacy.id });
    check("create-order on a waiting ₹0 booking → { paid, free }, no Cashfree session", r.status === 200 && r.json.paid === true && r.json.free === true && !("paymentSessionId" in r.json), JSON.stringify(r.json));
    check("…and it's PAID", (await row(legacy.id)).paymentStatus === "PAID", "ok");
    check("…with no payment order recorded", (await prisma.paymentOrder.count({ where: { patientId: patient.id } })) === 0, "ok");

    // The patient's list shows nothing to pay for any of them.
    const mine = (await call(patient, "GET", "/api/appointments/me?view=active")).json as unknown as { id: string; status: string; paymentStatus: string; amount: number; discountAmount: number }[];
    const owing = mine.filter((x) => x.status === "SCHEDULED" && x.paymentStatus !== "PAID" && x.amount - x.discountAmount <= 0);
    check("no accepted ₹0 booking is left waiting for payment", owing.length === 0, `${owing.length}`);
  } finally {
    await prisma.pushToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.couponRedemption.deleteMany({ where: { userId: { in: ids } } });
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
