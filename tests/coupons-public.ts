// Public coupons on /patient/payment (FP2-2): GET /api/coupons/available
// lists only coupons marked public that this patient could apply to this
// booking right now — never private codes, inactive/expired/not-started or
// full ones, the wrong consult type / context, under the minimum amount, or
// past the patient's per-user limit — and never usage counts or admin
// fields. A listed code applies through the normal apply route. Runs against
// a live dev server and the DB in .env, throwaway users/coupons only; no
// gateway is called (nothing here creates a Cashfree order).
//
//   BASE_URL=http://localhost:3122 npm run test:coupons-public
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 24 * 60 * 60_000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(u: U | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(u ? { Cookie: cookieFor(u) } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string } };
}

type Offer = Record<string, unknown> & { code: string; discountAmount: number; netPayable: number };

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  const codes: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `5${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const admin = await mk({ name: "Pub Coupon Admin", role: "ADMIN" });
  const doctor = await mk({ name: "Pub Coupon Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY), offersVideo: true } } });
  const patient = await mk({ name: "Pub Coupon Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const other = await mk({ name: "Pub Coupon Other", role: "PATIENT", patientProfile: { create: { age: 31, gender: "Female" } } });

  const code = (suffix: string) => { const c = `P${stamp}${suffix}`; codes.push(c); return c; };
  const coupon = (suffix: string, extra: Record<string, unknown> = {}) => prisma.coupon.create({
    data: { code: code(suffix), discountType: "FLAT", discountValue: 50, isPublic: true, createdByAdminId: admin.id, ...extra } as never,
  });
  const appt = (extra: Record<string, unknown> = {}) => prisma.appointment.create({
    data: {
      doctorId: doctor.id, patientId: patient.id, status: "SCHEDULED", consultType: "VIDEO", symptoms: "fever", amount: 300,
      paymentMethod: "ONLINE", scheduledAt: new Date(Date.now() + 3600e3), ...extra,
    } as never,
  });

  try {
    const ok = await coupon("OK", { description: "Festive offer" });
    const big = await coupon("BIG", { discountType: "PERCENT", discountValue: 50, maxDiscount: 120 });
    const priv = await coupon("PRIV", { isPublic: false });
    const off = await coupon("OFF", { isActive: false });
    const expired = await coupon("EXP", { expiresAt: new Date(Date.now() - DAY) });
    const later = await coupon("LATER", { startsAt: new Date(Date.now() + DAY) });
    const full = await coupon("FULL", { maxRedemptions: 2, usedCount: 2 });
    const minAmt = await coupon("MIN", { minAmount: 500 });
    const clinic = await coupon("CLINIC", { consultTypes: "CLINIC" });
    const feeOnly = await coupon("FEE", { appliesTo: "DOCTOR_REGISTRATION" });
    const usedOnce = await coupon("USED1", { perUserLimit: 1 });
    const usedTwice = await coupon("USED2", { perUserLimit: 2 });
    const tooMuch = await coupon("TOOMUCH", { discountValue: 299.5 }); // leaves ₹0.50 — the apply route refuses it

    // The patient already used USED1 and USED2 once on an earlier paid visit.
    const earlier = await appt({ paymentStatus: "PAID", status: "COMPLETED" });
    const earlier2 = await appt({ paymentStatus: "PAID", status: "COMPLETED" });
    await prisma.couponRedemption.create({ data: { couponId: usedOnce.id, userId: patient.id, appointmentId: earlier.id, discountAmount: 50, status: "CONFIRMED" } });
    await prisma.couponRedemption.create({ data: { couponId: usedTwice.id, userId: patient.id, appointmentId: earlier2.id, discountAmount: 50, status: "CONFIRMED" } });

    const a1 = await appt();
    let r = await call(patient, "GET", `/api/coupons/available?appointmentId=${a1.id}`);
    check("patient gets a list", r.status === 200 && Array.isArray(r.json.coupons), `${r.status} ${r.json.error ?? ""}`);
    const mine = ((r.json.coupons as Offer[]) ?? []).filter((c) => codes.includes(c.code));
    const listed = new Set(mine.map((c) => c.code));
    console.log(`      listed (test codes): ${[...listed].join(", ")}`);

    check("public, active, in-date coupon is listed", listed.has(ok.code), "ok");
    check("per-user limit 2, used once → still listed", listed.has(usedTwice.code), "ok");
    for (const [label, c] of [
      ["private (isPublic false)", priv], ["inactive", off], ["expired", expired], ["not started yet", later],
      ["no slots left", full], ["under minimum amount", minAmt], ["other consult type", clinic],
      ["fee-only context", feeOnly], ["per-user limit reached", usedOnce], ["leaves under ₹1", tooMuch],
    ] as const) {
      check(`${label} → not listed`, !listed.has(c.code), c.code);
    }

    const first = mine[0];
    check("biggest saving first", first?.code === big.code && first.discountAmount === 120 && first.netPayable === 180, JSON.stringify(first));
    const okRow = mine.find((c) => c.code === ok.code);
    check("description + server-computed discount", okRow?.description === "Festive offer" && okRow?.discountAmount === 50 && okRow?.netPayable === 250, JSON.stringify(okRow));
    const allowedKeys = new Set(["code", "description", "discountType", "discountValue", "maxDiscount", "expiresAt", "discountAmount", "netPayable"]);
    const extraKeys = [...new Set(((r.json.coupons as Offer[]) ?? []).flatMap((c) => Object.keys(c)))].filter((k) => !allowedKeys.has(k));
    check("no usage counts / admin fields in the response", extraKeys.length === 0, extraKeys.join(",") || "only public fields");

    // Access
    r = await call(other, "GET", `/api/coupons/available?appointmentId=${a1.id}`);
    check("another patient's appointment → 404", r.status === 404, `${r.status}`);
    r = await call(doctor, "GET", `/api/coupons/available?appointmentId=${a1.id}`);
    check("doctor → 401", r.status === 401, `${r.status}`);
    r = await call(null, "GET", `/api/coupons/available?appointmentId=${a1.id}`);
    check("signed out → 401", r.status === 401, `${r.status}`);
    r = await call(patient, "GET", `/api/coupons/available`);
    check("missing appointmentId → 400", r.status === 400, `${r.status}`);
    const paid = await appt({ paymentStatus: "PAID" });
    r = await call(patient, "GET", `/api/coupons/available?appointmentId=${paid.id}`);
    check("paid appointment → empty list", r.status === 200 && (r.json.coupons as Offer[]).length === 0, `${r.status} ${JSON.stringify(r.json)}`);
    const cash = await appt({ paymentMethod: "CASH" });
    r = await call(patient, "GET", `/api/coupons/available?appointmentId=${cash.id}`);
    check("cash appointment → empty list", r.status === 200 && (r.json.coupons as Offer[]).length === 0, `${r.status}`);

    // Tap to apply = the normal apply route; the server stays the authority.
    r = await call(patient, "POST", "/api/coupons/apply", { appointmentId: a1.id, code: ok.code });
    check("listed coupon applies via /api/coupons/apply", r.status === 200 && r.json.discountAmount === 50 && r.json.netPayable === 250, `${r.status} ${JSON.stringify(r.json)}`);
    const reserved = await prisma.couponRedemption.findFirst({ where: { appointmentId: a1.id } });
    check("…and reserves a slot", reserved?.status === "RESERVED" && reserved.couponId === ok.id, `${reserved?.status}`);
    r = await call(patient, "POST", "/api/coupons/apply", { appointmentId: a1.id, code: priv.code });
    check("private code typed in still works (not listed ≠ unusable)", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // Once a slot-limited coupon fills up it drops off the list.
    const last = await coupon("LAST", { maxRedemptions: 1 });
    const a2 = await appt();
    r = await call(patient, "POST", "/api/coupons/apply", { appointmentId: a2.id, code: last.code });
    check("last slot taken", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    const a3 = await prisma.appointment.create({
      data: { doctorId: doctor.id, patientId: other.id, status: "SCHEDULED", consultType: "VIDEO", symptoms: "cold", amount: 300, paymentMethod: "ONLINE", scheduledAt: new Date(Date.now() + 7200e3) } as never,
    });
    r = await call(other, "GET", `/api/coupons/available?appointmentId=${a3.id}`);
    const otherCodes = new Set(((r.json.coupons as Offer[]) ?? []).map((c) => c.code));
    check("full coupon no longer listed for others", r.status === 200 && !otherCodes.has(last.code) && otherCodes.has(ok.code), [...otherCodes].filter((c) => codes.includes(c)).join(","));

    // Admin flag
    r = await call(admin, "POST", "/api/admin/coupons", { code: code("ADMDEF"), discountType: "PERCENT", discountValue: 10 });
    check("admin-created coupon is private by default", r.status === 200 && r.json.isPublic === false, `${r.status} ${r.json.isPublic}`);
    const defId = String(r.json.id);
    r = await call(admin, "PATCH", `/api/admin/coupons/${defId}`, { isPublic: true });
    check("admin PATCH isPublic → true", r.status === 200 && r.json.isPublic === true, `${r.status} ${r.json.isPublic}`);
    r = await call(admin, "POST", "/api/admin/coupons", { code: code("ADMPUB"), discountType: "FLAT", discountValue: 20, isPublic: true });
    check("admin can create a public coupon", r.status === 200 && r.json.isPublic === true, `${r.status} ${r.json.isPublic}`);
  } finally {
    await prisma.couponRedemption.deleteMany({ where: { OR: [{ userId: { in: ids } }, { coupon: { code: { in: codes } } }] } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.coupon.deleteMany({ where: { code: { in: codes } } });
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
