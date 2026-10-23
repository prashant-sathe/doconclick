// Nurse fee coupons — same as doctors: a coupon whose appliesTo includes
// NURSE_REGISTRATION / NURSE_SUBSCRIPTION can be previewed (/api/coupons/validate)
// and applied at the nurse fee checkout (/api/nurses/fee-order { code }); the
// Cashfree order is created for the discounted amount, the slot is reserved,
// the webhook confirms it and logs the coupon on the NursePaymentLog, and a
// failed payment frees the slot. Doctor-only / booking-only coupons are
// refused for nurses and vice versa.
//
// Like test:walk-in, this starts its OWN dev server on port 3100 with
// Cashfree pointed at an in-process mock and a test-only secret, so no real
// gateway order is ever created. Stop any running `next dev` first. Uses the
// DB in .env, throwaway users/coupons only; the nurse fee settings are put
// back afterwards.
//
//   npm run test:nurse-fee-coupons
import "dotenv/config";
import crypto from "crypto";
import http from "http";
import { spawn, type ChildProcess } from "child_process";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { validateCoupon } from "../src/lib/coupons";

const PORT = 3100;
const MOCK_PORT = 4012;
const BASE = `http://localhost:${PORT}`;
const TEST_SECRET = "test-only-cashfree-secret";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// ── Mock Cashfree ──
const mock = { createdOrders: [] as { order_id: string; order_amount: number }[] };
const mockServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/orders") {
      const o = JSON.parse(body);
      mock.createdOrders.push(o);
      res.end(JSON.stringify({ payment_session_id: `sess_${o.order_id}`, cf_order_id: `cf_${o.order_id}` }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
});

async function startServer(): Promise<ChildProcess> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("AWS_")) delete env[k];
  Object.assign(env, { CASHFREE_API_BASE: `http://127.0.0.1:${MOCK_PORT}`, CASHFREE_APP_ID: "test-app", CASHFREE_SECRET_KEY: TEST_SECRET });
  const child = spawn("npx", ["next", "dev", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dev server didn't start:\n${log}`)), 60000);
    const onData = (d: Buffer) => {
      log += d.toString();
      if (/Ready in/.test(log)) { clearTimeout(timer); resolve(); }
      if (/another instance|EADDRINUSE|already running/i.test(log)) { clearTimeout(timer); reject(new Error(`dev server failed — stop any running \`next dev\` first:\n${log}`)); }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`dev server exited (${code}):\n${log}`)); });
  });
  return child;
}

async function webhook(type: "PAYMENT_SUCCESS_WEBHOOK" | "PAYMENT_FAILED_WEBHOOK", orderId: string, amount: number) {
  const paymentId = `pay_nfc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const body = JSON.stringify({
    type,
    event_time: new Date().toISOString(),
    data: { order: { order_id: orderId, order_amount: amount }, payment: { cf_payment_id: paymentId, payment_status: type === "PAYMENT_SUCCESS_WEBHOOK" ? "SUCCESS" : "FAILED" } },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(ts + body).digest("base64");
  const r = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-signature": sig, "x-webhook-timestamp": ts }, body });
  return { status: r.status, paymentId };
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookieFor(as), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}

function pure() {
  const base = { isActive: true, startsAt: null, expiresAt: null, minAmount: 0, consultTypes: null, perUserLimit: 1, discountType: "PERCENT", discountValue: 20, maxDiscount: null } as never;
  const v = (appliesTo: string, context: "NURSE_REGISTRATION" | "NURSE_SUBSCRIPTION" | "DOCTOR_REGISTRATION") =>
    validateCoupon({ coupon: { ...(base as object), appliesTo } as never, context, baseAmount: 500, redemptionCountForUser: 0 });
  check("NURSE_REGISTRATION coupon → valid for the nurse registration fee", v("NURSE_REGISTRATION", "NURSE_REGISTRATION").ok, "ok");
  const wrong = v("DOCTOR_REGISTRATION", "NURSE_REGISTRATION");
  check("…a doctor-only coupon is refused for it", !wrong.ok && /nurse registration fee/.test(wrong.error), wrong.ok ? "ok?" : wrong.error);
  const back = v("NURSE_SUBSCRIPTION", "DOCTOR_REGISTRATION");
  check("…and a nurse-only coupon is refused for doctors", !back.ok, back.ok ? "ok?" : back.error);
}

async function main() {
  pure();
  await new Promise<void>((r) => mockServer.listen(MOCK_PORT, "127.0.0.1", r));
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  const codes: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `6${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const nurse = await mk({ name: "Fee Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });
  const nurse2 = await mk({ name: "Fee Nurse 2", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });
  const doctor = await mk({ name: "Fee Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED" } } });
  const mkCoupon = async (suffix: string, data: Record<string, unknown>) => {
    const code = `NF${suffix}${stamp}`;
    codes.push(code);
    return prisma.coupon.create({ data: { code, discountType: "PERCENT", discountValue: 20, ...data } as never });
  };
  const reg = await mkCoupon("R", { appliesTo: "NURSE_REGISTRATION" });
  const sub = await mkCoupon("S", { appliesTo: "NURSE_SUBSCRIPTION", discountType: "FLAT", discountValue: 100 });
  const docOnly = await mkCoupon("D", { appliesTo: "DOCTOR_REGISTRATION" });
  const bookings = await mkCoupon("B", { appliesTo: "APPOINTMENT" });
  const full = await mkCoupon("F", { appliesTo: "NURSE_REGISTRATION", discountValue: 100 });

  const settings = await prisma.platformSettings.findFirst();
  if (!settings) throw new Error("no PlatformSettings row");
  const before = { nurseRegistrationFee: settings.nurseRegistrationFee, nurseSubscriptionFee: settings.nurseSubscriptionFee };
  await prisma.platformSettings.update({ where: { id: settings.id }, data: { nurseRegistrationFee: 500, nurseSubscriptionFee: 300 } });
  const lastOrder = () => mock.createdOrders[mock.createdOrders.length - 1];
  const used = async (id: string) => (await prisma.coupon.findUniqueOrThrow({ where: { id } })).usedCount;

  let server: ChildProcess | null = null;
  try {
    server = await startServer();
    await call(nurse, "POST", "/api/coupons/validate", {}); // compile
    await fetch(`${BASE}/api/payments/webhook`);

    // ── Preview ──
    let r = await call(nurse, "POST", "/api/coupons/validate", { code: reg.code.toLowerCase(), context: "NURSE_REGISTRATION" });
    check("preview: 20% off ₹500 registration → ₹400", r.status === 200 && r.json.discountAmount === 100 && r.json.netAmount === 400 && r.json.code === reg.code, `${r.status} ${JSON.stringify(r.json)}`);
    r = await call(nurse, "POST", "/api/coupons/validate", { code: docOnly.code, context: "NURSE_REGISTRATION" });
    check("preview: a doctor-only coupon → 400", r.status === 400 && /nurse registration fee/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    r = await call(nurse, "POST", "/api/coupons/validate", { code: bookings.code, context: "NURSE_REGISTRATION" });
    check("preview: a bookings-only coupon → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(nurse, "POST", "/api/coupons/validate", { code: reg.code, context: "DOCTOR_REGISTRATION" });
    check("preview: a nurse asking for a doctor context → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(doctor, "POST", "/api/coupons/validate", { code: reg.code, context: "NURSE_REGISTRATION" });
    check("preview: a doctor asking for a nurse context → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(nurse, "POST", "/api/coupons/validate", { code: full.code, context: "NURSE_REGISTRATION" });
    check("preview: a 100% coupon on a fee → refused (as for doctors)", r.status === 400, `${r.status} ${r.json.error}`);
    check("…previews reserve nothing", (await used(reg.id)) === 0, `usedCount ${await used(reg.id)}`);

    // ── Registration with a coupon ──
    r = await call(nurse, "POST", "/api/nurses/fee-order", { kind: "REGISTRATION", code: docOnly.code });
    check("checkout with a doctor-only coupon → 400, no order", r.status === 400 && mock.createdOrders.length === 0, `${r.status} ${r.json.error}`);
    r = await call(nurse, "POST", "/api/nurses/fee-order", { kind: "REGISTRATION", code: reg.code });
    const regOrder = lastOrder();
    check("checkout with the coupon → Cashfree order for ₹400, slot reserved",
      r.status === 200 && !!r.json.paymentSessionId && regOrder?.order_amount === 400 && (await used(reg.id)) === 1,
      `${r.status} ₹${regOrder?.order_amount} used ${await used(reg.id)}`);
    const pending = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } });
    check("…profile holds the order and its discounted amount", pending.cashfreeOrderId === regOrder.order_id && pending.pendingOrderAmount === 400, `${pending.pendingOrderAmount}`);
    const w = await webhook("PAYMENT_SUCCESS_WEBHOOK", regOrder.order_id, 400);
    const paid = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } });
    const log = await prisma.nursePaymentLog.findFirst({ where: { nurseId: nurse.id, type: "REGISTRATION" } });
    const redemption = await prisma.couponRedemption.findUnique({ where: { orderId: regOrder.order_id } });
    check("webhook → registration paid, log has ₹400 + coupon + ₹100 discount, redemption CONFIRMED",
      w.status === 200 && paid.registrationFeePaid && log?.amount === 400 && log.couponCode === reg.code && log.discountAmount === 100 && redemption?.status === "CONFIRMED" && redemption.kind === "NURSE_REGISTRATION",
      `${paid.registrationFeePaid} ${JSON.stringify({ amount: log?.amount, code: log?.couponCode, d: log?.discountAmount })} ${redemption?.status}`);
    await webhook("PAYMENT_SUCCESS_WEBHOOK", regOrder.order_id, 400);
    check("…a retried webhook doesn't log it twice", (await prisma.nursePaymentLog.count({ where: { nurseId: nurse.id } })) === 1, "1 log");

    // ── Per-user limit ──
    r = await call(nurse, "POST", "/api/coupons/validate", { code: reg.code, context: "NURSE_REGISTRATION" });
    check("the same coupon again (per-user limit 1) → 400", r.status === 400 && /already used/.test(String(r.json.error)), `${r.status} ${r.json.error}`);

    // ── Subscription: flat ₹100 off ₹300, then a failed payment frees the slot ──
    r = await call(nurse, "POST", "/api/coupons/validate", { code: sub.code, context: "NURSE_SUBSCRIPTION" });
    check("plan preview: ₹100 off ₹300 → ₹200", r.status === 200 && r.json.netAmount === 200, `${r.status} ${r.json.netAmount}`);
    r = await call(nurse, "POST", "/api/nurses/fee-order", { kind: "SUBSCRIPTION", code: sub.code });
    const subOrder = lastOrder();
    check("plan checkout → order for ₹200, reserved", r.status === 200 && subOrder.order_amount === 200 && (await used(sub.id)) === 1, `₹${subOrder.order_amount}`);
    await webhook("PAYMENT_FAILED_WEBHOOK", subOrder.order_id, 200);
    check("failed payment → slot freed, reservation gone",
      (await used(sub.id)) === 0 && !(await prisma.couponRedemption.findUnique({ where: { orderId: subOrder.order_id } })), `used ${await used(sub.id)}`);

    // Retry with the coupon, abandon, then pay without it: the old hold is freed.
    await call(nurse, "POST", "/api/nurses/fee-order", { kind: "SUBSCRIPTION", code: sub.code });
    const held = lastOrder();
    r = await call(nurse, "POST", "/api/nurses/fee-order", { kind: "SUBSCRIPTION" });
    const plain = lastOrder();
    check("abandoned coupon checkout, then pay without it → ₹300 order, hold released",
      r.status === 200 && plain.order_amount === 300 && (await used(sub.id)) === 0 && !(await prisma.couponRedemption.findUnique({ where: { orderId: held.order_id } })),
      `₹${plain.order_amount} used ${await used(sub.id)}`);
    await webhook("PAYMENT_SUCCESS_WEBHOOK", plain.order_id, 300);
    const subLog = await prisma.nursePaymentLog.findFirst({ where: { nurseId: nurse.id, type: "SUBSCRIPTION" } });
    check("…plan paid at full price, no coupon on the log", subLog?.amount === 300 && subLog.couponCode === null && subLog.discountAmount === 0, JSON.stringify({ a: subLog?.amount, c: subLog?.couponCode }));

    // ── Usage cap across nurses ──
    await prisma.coupon.update({ where: { id: reg.id }, data: { maxRedemptions: 1 } });
    r = await call(nurse2, "POST", "/api/nurses/fee-order", { kind: "REGISTRATION", code: reg.code });
    check("another nurse once the total cap (1) is used → 400", r.status === 400 && /usage limit/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
  } finally {
    server?.kill("SIGTERM");
    mockServer.close();
    await prisma.platformSettings.update({ where: { id: settings.id }, data: before });
    await prisma.couponRedemption.deleteMany({ where: { userId: { in: ids } } });
    await prisma.coupon.deleteMany({ where: { code: { in: codes } } });
    await prisma.nursePaymentLog.deleteMany({ where: { nurseId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
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
