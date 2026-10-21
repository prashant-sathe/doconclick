// Coupons (BUG-TRACKER #45): the coupon is validated as stored (existing +
// patch) on PATCH, past expiry and absurd flat values are refused, a 100%
// coupon is accepted with a warning, and a booking left with nothing to pay
// is confirmed without calling Cashfree. Pure checks, then API checks against
// a live dev server and the DB in .env, throwaway users/coupons only. The
// paid (Cashfree) path is deliberately not exercised — it would hit the
// production gateway.
//
//   npm run test:coupons
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { validateCouponConfig, validateCoupon, MAX_COUPON_RUPEES } from "../src/lib/coupons";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 24 * 60 * 60_000;
const future = (d: number) => new Date(Date.now() + d * DAY).toISOString();
const past = (d: number) => new Date(Date.now() - d * DAY).toISOString();

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
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; warnings?: string[] } };
}

async function main() {
  // ── The merged-coupon rules ──
  const cfg = (c: Partial<Parameters<typeof validateCouponConfig>[0]>, checkExpiry = true) =>
    validateCouponConfig({ discountType: "PERCENT", discountValue: 10, maxDiscount: null, startsAt: null, expiresAt: null, ...c }, { checkExpiry });
  const err = (r: ReturnType<typeof cfg>) => ("error" in r ? r.error : "");
  check("₹500 FLAT patched to PERCENT → 500% rejected", err(cfg({ discountType: "PERCENT", discountValue: 500 })).includes("more than 100%"), err(cfg({ discountType: "PERCENT", discountValue: 500 })));
  check(`FLAT over ₹${MAX_COUPON_RUPEES.toLocaleString("en-IN")} rejected`, err(cfg({ discountType: "FLAT", discountValue: 90_000_000 })).includes("flat discount"), "ok");
  check("FLAT at the ceiling accepted", !err(cfg({ discountType: "FLAT", discountValue: MAX_COUPON_RUPEES })), "ok");
  check("maxDiscount over the ceiling rejected", !!err(cfg({ maxDiscount: MAX_COUPON_RUPEES + 1 })), "ok");
  check("past expiry rejected when checked", err(cfg({ expiresAt: new Date(Date.now() - DAY) })).includes("already passed"), "ok");
  check("past expiry allowed when not checked (deactivating an old coupon)", !err(cfg({ expiresAt: new Date(Date.now() - DAY) }, false)), "ok");
  check("expiry before start rejected", !!err(cfg({ startsAt: new Date(Date.now() + 2 * DAY), expiresAt: new Date(Date.now() + DAY) })), "ok");
  const w100 = cfg({ discountValue: 100 });
  check("100% accepted with a no-cap warning", !("error" in w100) && w100.warnings.length === 1 && /no max-discount cap/.test(w100.warnings[0]), JSON.stringify(w100));
  const w100c = cfg({ discountValue: 100, maxDiscount: 500 });
  check("100% with a cap: warning names the cap", !("error" in w100c) && /₹500/.test(w100c.warnings[0]), JSON.stringify(w100c));
  const w50 = cfg({ discountValue: 50 });
  check("50% → no warning", !("error" in w50) && w50.warnings.length === 0, "ok");

  const base = { id: "c", code: "X", description: null, discountType: "FLAT", discountValue: 299.5, maxDiscount: null, minAmount: 0, appliesTo: "APPOINTMENT", consultTypes: null, maxRedemptions: null, perUserLimit: 1, usedCount: 0, startsAt: null, expiresAt: null, isActive: true, createdByAdminId: null, createdAt: new Date(), updatedAt: new Date() };
  const sub1 = validateCoupon({ coupon: base, context: "APPOINTMENT", baseAmount: 300, consultType: "VIDEO", redemptionCountForUser: 0 });
  check("coupon leaving ₹0.50 to pay → refused (gateway minimum ₹1)", !sub1.ok && sub1.error.includes("less than ₹1"), sub1.ok ? "accepted" : sub1.error);
  const free = validateCoupon({ coupon: { ...base, discountValue: 300 }, context: "APPOINTMENT", baseAmount: 300, consultType: "VIDEO", redemptionCountForUser: 0 });
  check("coupon leaving exactly ₹0 → allowed", free.ok, "ok");

  // ── API ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  const codes: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `4${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const admin = await mk({ name: "Coupon Admin", role: "ADMIN" });
  const doctor = await mk({ name: "Coupon Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY), offersVideo: true } } });
  const patient = await mk({ name: "Coupon Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const code = (suffix: string) => { const c = `T${stamp}${suffix}`; codes.push(c); return c; };
  const create = (extra: Record<string, unknown>) => call(admin, "POST", "/api/admin/coupons", { discountType: "PERCENT", discountValue: 10, ...extra });

  try {
    let r = await create({ code: code("PAST"), expiresAt: past(1) });
    check("create with a past expiry → 400", r.status === 400 && (r.json.error ?? "").includes("future"), `${r.status} ${r.json.error}`);
    r = await create({ code: code("HUGE"), discountType: "FLAT", discountValue: 90_000_000 });
    check("create ₹9 crore flat → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await create({ code: code("OVER"), discountValue: 150 });
    check("create 150% → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await create({ code: code("FULL"), discountValue: 100, expiresAt: future(30) });
    check("create 100% → 200 with a warning", r.status === 200 && (r.json.warnings ?? []).length === 1, `${r.status} ${JSON.stringify(r.json.warnings)}`);

    // PATCH judged as stored.
    r = await create({ code: code("FLAT"), discountType: "FLAT", discountValue: 500 });
    const flatId = String(r.json.id);
    r = await call(admin, "PATCH", `/api/admin/coupons/${flatId}`, { discountType: "PERCENT" });
    check("PATCH only discountType on a ₹500 FLAT coupon → 400 (was: became 500%)", r.status === 400 && (r.json.error ?? "").includes("100%"), `${r.status} ${r.json.error}`);
    const stored = await prisma.coupon.findUniqueOrThrow({ where: { id: flatId } });
    check("…and the coupon is unchanged", stored.discountType === "FLAT" && stored.discountValue === 500, `${stored.discountType} ${stored.discountValue}`);
    r = await call(admin, "PATCH", `/api/admin/coupons/${flatId}`, { discountValue: 90_000_000 });
    check("PATCH only discountValue to ₹9 crore on a FLAT coupon → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(admin, "PATCH", `/api/admin/coupons/${flatId}`, { expiresAt: past(2) });
    check("PATCH expiry into the past → 400", r.status === 400 && (r.json.error ?? "").includes("future"), `${r.status} ${r.json.error}`);
    r = await call(admin, "PATCH", `/api/admin/coupons/${flatId}`, { discountType: "PERCENT", discountValue: 20 });
    check("PATCH type + value together (valid) → 200", r.status === 200 && r.json.discountType === "PERCENT", `${r.status} ${r.json.error ?? ""}`);
    r = await call(admin, "PATCH", `/api/admin/coupons/${flatId}`, { discountValue: 100 });
    check("PATCH to 100% → 200 with a warning", r.status === 200 && (r.json.warnings ?? []).length === 1, `${r.status} ${JSON.stringify(r.json.warnings)}`);

    // An already-expired coupon can still be switched off, but not back on.
    const old = await prisma.coupon.create({ data: { code: code("OLD"), discountType: "PERCENT", discountValue: 10, expiresAt: new Date(Date.now() - DAY), isActive: true, createdByAdminId: admin.id } });
    r = await call(admin, "PATCH", `/api/admin/coupons/${old.id}`, { isActive: false });
    check("deactivating an already-expired coupon → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(admin, "PATCH", `/api/admin/coupons/${old.id}`, { isActive: true });
    check("reactivating it without a new expiry → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(admin, "PATCH", `/api/admin/coupons/${old.id}`, { isActive: true, expiresAt: future(10) });
    check("reactivating with a future expiry → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // ── Free booking: no gateway ──
    const appt = (extra: Record<string, unknown>) => prisma.appointment.create({
      data: {
        doctorId: doctor.id, patientId: patient.id, status: "SCHEDULED", consultType: "VIDEO", symptoms: "fever", amount: 300,
        paymentMethod: "ONLINE", scheduledAt: new Date(Date.now() + 3600e3), createdAt: new Date(Date.now() - DAY), ...extra,
      } as never,
    });
    const full = await prisma.coupon.create({ data: { code: code("FREE100"), discountType: "PERCENT", discountValue: 100, createdByAdminId: admin.id } });
    const a1 = await appt({});
    r = await call(patient, "POST", "/api/coupons/apply", { appointmentId: a1.id, code: full.code });
    check("100% coupon applies: ₹300 off, ₹0 to pay", r.status === 200 && r.json.discountAmount === 300 && r.json.netPayable === 0, `${r.status} ${JSON.stringify(r.json)}`);
    r = await call(patient, "POST", "/api/wallet/pay", { appointmentId: a1.id });
    check("wallet pay on a free booking → 400 (no ₹0 ledger row)", r.status === 400 && (r.json.error ?? "").includes("Nothing to pay"), `${r.status} ${r.json.error}`);
    const ordersBefore = await prisma.paymentOrder.count({ where: { patientId: patient.id } });
    r = await call(patient, "POST", "/api/payments/create-order", { appointmentId: a1.id });
    check("create-order on a free booking → paid, no gateway", r.status === 200 && r.json.paid === true, `${r.status} ${JSON.stringify(r.json)}`);
    const done = await prisma.appointment.findUniqueOrThrow({ where: { id: a1.id } });
    check("appointment is PAID with paidAt, no Cashfree ids", done.paymentStatus === "PAID" && !!done.paidAt && done.cashfreeOrderId === null && done.cashfreePaymentId === null, `${done.paymentStatus} ${done.paidAt?.toISOString()}`);
    const red = await prisma.couponRedemption.findFirst({ where: { appointmentId: a1.id } });
    check("coupon redemption CONFIRMED", red?.status === "CONFIRMED", `${red?.status}`);
    check("no PaymentOrder created", (await prisma.paymentOrder.count({ where: { patientId: patient.id } })) === ordersBefore, "ok");
    r = await call(patient, "POST", "/api/payments/create-order", { appointmentId: a1.id });
    check("paying again → 400 already paid", r.status === 400, `${r.status} ${r.json.error}`);

    const a2 = await appt({ amount: 0 });
    r = await call(patient, "POST", "/api/payments/create-order", { appointmentId: a2.id });
    check("a ₹0 fee (no coupon) is confirmed the same way", r.status === 200 && r.json.paid === true, `${r.status} ${JSON.stringify(r.json)}`);

    const sub = await prisma.coupon.create({ data: { code: code("SUB1"), discountType: "FLAT", discountValue: 299.5, createdByAdminId: admin.id } });
    const a3 = await appt({});
    r = await call(patient, "POST", "/api/coupons/apply", { appointmentId: a3.id, code: sub.code });
    check("coupon leaving ₹0.50 → refused at apply", r.status === 400 && (r.json.error ?? "").includes("less than ₹1"), `${r.status} ${r.json.error}`);
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
