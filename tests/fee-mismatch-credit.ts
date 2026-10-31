// P0-15 — a doctor/nurse fee payment (doctor registration, doctor plan, nurse
// registration) whose charged amount doesn't match its order is never lost:
// nothing is activated, the full amount is credited to the payer's wallet as
// one PAYMENT_CREDIT row (a Cashfree retry of the same payment never credits
// twice), the reserved coupon slot is freed, and they can simply pay again —
// a matching payment then activates as before. A retry of an already-applied
// doctor plan payment (with or without a coupon) is a no-op: no wallet credit,
// plan extended exactly once, one DoctorPaymentLog.
//
// Like test:nurse-fee-coupons, this starts its OWN dev server (tests/devServer.ts)
// with Cashfree pointed at an in-process mock and a test-only secret, so no real
// gateway order is ever created. Uses the DB in .env, throwaway users/coupons
// only; fee settings are put back afterwards.
//
//   npm run test:fee-mismatch
import "dotenv/config";
import crypto from "crypto";
import http from "http";
import type { ChildProcess } from "child_process";
import type { AddressInfo } from "net";
import { startDevServer } from "./devServer";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

let BASE = "";
const TEST_SECRET = "test-only-cashfree-secret";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

const created: { order_id: string; order_amount: number }[] = [];
const mockServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/orders") {
      const o = JSON.parse(body);
      created.push(o);
      res.end(JSON.stringify({ payment_session_id: `sess_${o.order_id}`, cf_order_id: `cf_${o.order_id}` }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
});
const lastOrder = () => created[created.length - 1];

async function success(orderId: string, amount: number, paymentId: string) {
  const body = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    event_time: new Date().toISOString(),
    data: { order: { order_id: orderId, order_amount: amount }, payment: { cf_payment_id: paymentId, payment_status: "SUCCESS" } },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(ts + body).digest("base64");
  const r = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-signature": sig, "x-webhook-timestamp": ts }, body });
  return r.status;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function walletOf(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const credits = wallet ? await prisma.walletTransaction.findMany({ where: { walletId: wallet.id, type: "PAYMENT_CREDIT" } }) : [];
  return { balance: wallet?.balance ?? 0, credits };
}
const used = async (id: string) => (await prisma.coupon.findUniqueOrThrow({ where: { id } })).usedCount;
const pushes = (userId: string) => prisma.notification.count({ where: { userId, kind: "feePaymentCreditedToWallet" } });
// The push (and its inbox row) is fire-and-forget after the webhook replies.
async function settledPushes(userId: string) {
  for (let i = 0; i < 20 && (await pushes(userId)) === 0; i++) await new Promise((r) => setTimeout(r, 250));
  return pushes(userId);
}

// One mismatch scenario: pay `orderAmount + 7` against a coupon order, retry it,
// then check nothing was activated and the coupon slot was freed.
async function mismatch(label: string, user: U, orderId: string, orderAmount: number, couponId: string, notActivated: () => Promise<boolean>) {
  const paid = orderAmount + 7;
  const paymentId = `pay_fmc_${label.replace(/\W/g, "")}_${Date.now()}`;
  const s1 = await success(orderId, paid, paymentId);
  let w = await walletOf(user.id);
  check(`${label}: mismatch → full ₹${paid} credited to the wallet as one PAYMENT_CREDIT`,
    s1 === 200 && w.balance === paid && w.credits.length === 1 && w.credits[0].amount === paid && w.credits[0].balanceAfter === paid &&
      w.credits[0].creditOfPaymentId === paymentId && w.credits[0].cashfreeOrderId === orderId,
    `${s1} balance ${w.balance} credits ${w.credits.length}`);
  check(`${label}: …not activated`, await notActivated(), "profile unchanged");
  check(`${label}: …coupon slot freed, reservation gone`,
    (await used(couponId)) === 0 && !(await prisma.couponRedemption.findUnique({ where: { orderId } })), `usedCount ${await used(couponId)}`);
  const pushCount = await settledPushes(user.id);
  check(`${label}: …one localized push to the payer`, pushCount === 1, `${pushCount}`);
  const s2 = await success(orderId, paid, paymentId);
  await new Promise((r) => setTimeout(r, 1000)); // give a (wrong) second push time to land
  w = await walletOf(user.id);
  check(`${label}: retried webhook → no second credit, no second push`,
    s2 === 200 && w.balance === paid && w.credits.length === 1 && (await pushes(user.id)) === 1, `balance ${w.balance} credits ${w.credits.length}`);
  return paid;
}

async function main() {
  await new Promise<void>((r) => mockServer.listen(0, "127.0.0.1", r));
  const mockPort = (mockServer.address() as AddressInfo).port;
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  const codes: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `6${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const docReg = await mk({ name: "FMC Doctor Reg", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED" } } });
  const docSub = await mk({ name: "FMC Doctor Sub", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", registrationFeePaid: true, registrationFeeStatus: "PAID" } } });
  const docSubC = await mk({ name: "FMC Doctor Sub Coupon", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", registrationFeePaid: true, registrationFeeStatus: "PAID" } } });
  const nurse = await mk({ name: "FMC Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });
  const mkCoupon = async (suffix: string, appliesTo: string) => {
    const code = `FM${suffix}${stamp}`;
    codes.push(code);
    return prisma.coupon.create({ data: { code, discountType: "PERCENT", discountValue: 20, appliesTo } as never });
  };
  const cDocReg = await mkCoupon("R", "DOCTOR_REGISTRATION");
  const cDocSub = await mkCoupon("S", "DOCTOR_SUBSCRIPTION");
  const cDocSubOk = await mkCoupon("C", "DOCTOR_SUBSCRIPTION");
  const cNurse = await mkCoupon("N", "NURSE_REGISTRATION");

  const settings = await prisma.platformSettings.findFirst();
  if (!settings) throw new Error("no PlatformSettings row");
  const before = { doctorRegistrationFee: settings.doctorRegistrationFee, doctorRegistrationOriginalFee: settings.doctorRegistrationOriginalFee, nurseRegistrationFee: settings.nurseRegistrationFee };
  await prisma.platformSettings.update({ where: { id: settings.id }, data: { doctorRegistrationOriginalFee: 499, doctorRegistrationFee: 200, nurseRegistrationFee: 500 } });

  let server: ChildProcess | null = null;
  try {
    const started = await startDevServer({
      label: "fee-mismatch",
      env: { CASHFREE_API_BASE: `http://127.0.0.1:${mockPort}`, CASHFREE_APP_ID: "test-app", CASHFREE_SECRET_KEY: TEST_SECRET },
    });
    server = started.child;
    BASE = started.base;
    await fetch(`${BASE}/api/payments/webhook`); // compile

    // ── Doctor registration ──
    let r = await call(docReg, "/api/doctors/registration-fee/create-order", { code: cDocReg.code });
    let order = lastOrder();
    check("doctor registration: coupon order for ₹160, slot reserved", r.status === 200 && order.order_amount === 160 && (await used(cDocReg.id)) === 1, `${r.status} ₹${order?.order_amount}`);
    const regCredit = await mismatch("doctor registration", docReg, order.order_id, 160, cDocReg.id, async () => {
      const p = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docReg.id } });
      return !p.registrationFeePaid && p.trialEndsAt === null && (await prisma.doctorPaymentLog.count({ where: { doctorId: docReg.id } })) === 0;
    });
    r = await call(docReg, "/api/doctors/registration-fee/create-order", {});
    order = lastOrder();
    await success(order.order_id, order.order_amount, `pay_fmc_regok_${Date.now()}`);
    let dp = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docReg.id } });
    check("doctor registration: paying again at the right amount activates as before, wallet untouched",
      r.status === 200 && order.order_amount === 200 && dp.registrationFeePaid && !!dp.trialEndsAt &&
        (await prisma.doctorPaymentLog.count({ where: { doctorId: docReg.id, type: "REGISTRATION" } })) === 1 && (await walletOf(docReg.id)).balance === regCredit,
      `${dp.registrationFeePaid} balance ${(await walletOf(docReg.id)).balance}`);

    // ── Doctor subscription ──
    r = await call(docSub, "/api/doctors/subscription/create-order", { code: cDocSub.code });
    order = lastOrder();
    const subAmount = order.order_amount;
    check("doctor plan: coupon order created, slot reserved", r.status === 200 && subAmount > 0 && (await used(cDocSub.id)) === 1, `${r.status} ₹${subAmount}`);
    const subCredit = await mismatch("doctor plan", docSub, order.order_id, subAmount, cDocSub.id, async () => {
      const p = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docSub.id } });
      return p.subscriptionPaidUntil === null && (await prisma.doctorPaymentLog.count({ where: { doctorId: docSub.id } })) === 0;
    });
    r = await call(docSub, "/api/doctors/subscription/create-order", {});
    order = lastOrder();
    const subOkPayment = `pay_fmc_subok_${Date.now()}`;
    await success(order.order_id, order.order_amount, subOkPayment);
    dp = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docSub.id } });
    check("doctor plan: paying again at the right amount extends the plan, wallet untouched",
      r.status === 200 && !!dp.subscriptionPaidUntil && dp.subscriptionPaidUntil.getTime() > Date.now() && (await walletOf(docSub.id)).balance === subCredit,
      `${dp.subscriptionPaidUntil?.toISOString()} balance ${(await walletOf(docSub.id)).balance}`);
    // Same success webhook again (Cashfree retry) — must not extend the plan twice.
    const subPaidUntil = dp.subscriptionPaidUntil?.getTime();
    let s = await success(order.order_id, order.order_amount, subOkPayment);
    dp = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docSub.id } });
    let w = await walletOf(docSub.id);
    check("doctor plan: retried success webhook → plan extended once, one log, wallet untouched",
      s === 200 && dp.subscriptionPaidUntil?.getTime() === subPaidUntil && w.balance === subCredit && w.credits.length === 1 &&
        (await prisma.doctorPaymentLog.count({ where: { doctorId: docSub.id, type: "SUBSCRIPTION" } })) === 1,
      `${s} ${dp.subscriptionPaidUntil?.toISOString()} balance ${w.balance} credits ${w.credits.length}`);

    // Coupon plan payment at the right amount, then the same webhook again —
    // the now-CONFIRMED coupon must not make the retry look like a mismatch.
    r = await call(docSubC, "/api/doctors/subscription/create-order", { code: cDocSubOk.code });
    order = lastOrder();
    const subCPayment = `pay_fmc_subc_${Date.now()}`;
    const s1 = await success(order.order_id, order.order_amount, subCPayment);
    dp = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docSubC.id } });
    const subCPaidUntil = dp.subscriptionPaidUntil?.getTime();
    const redemption = await prisma.couponRedemption.findUnique({ where: { orderId: order.order_id } });
    check("doctor plan + coupon: success at the discounted amount extends the plan, coupon CONFIRMED",
      r.status === 200 && s1 === 200 && (redemption?.discountAmount ?? 0) > 0 &&
        !!subCPaidUntil && subCPaidUntil > Date.now() && redemption?.status === "CONFIRMED" && (await used(cDocSubOk.id)) === 1,
      `${r.status}/${s1} ₹${order.order_amount} ${redemption?.status}`);
    s = await success(order.order_id, order.order_amount, subCPayment);
    await new Promise((res) => setTimeout(res, 1000)); // give a (wrong) push time to land
    dp = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docSubC.id } });
    w = await walletOf(docSubC.id);
    check("doctor plan + coupon: retried success webhook → no wallet credit, no PAYMENT_CREDIT, plan extended once, one log",
      s === 200 && w.balance === 0 && w.credits.length === 0 && (await pushes(docSubC.id)) === 0 &&
        dp.subscriptionPaidUntil?.getTime() === subCPaidUntil &&
        (await prisma.doctorPaymentLog.count({ where: { doctorId: docSubC.id, type: "SUBSCRIPTION" } })) === 1,
      `${s} balance ${w.balance} credits ${w.credits.length} ${dp.subscriptionPaidUntil?.toISOString()}`);

    // ── Nurse registration ──
    r = await call(nurse, "/api/nurses/fee-order", { kind: "REGISTRATION", code: cNurse.code });
    order = lastOrder();
    check("nurse registration: coupon order for ₹400, slot reserved", r.status === 200 && order.order_amount === 400 && (await used(cNurse.id)) === 1, `${r.status} ₹${order?.order_amount}`);
    const nurseCredit = await mismatch("nurse registration", nurse, order.order_id, 400, cNurse.id, async () => {
      const p = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } });
      return !p.registrationFeePaid && (await prisma.nursePaymentLog.count({ where: { nurseId: nurse.id } })) === 0;
    });
    r = await call(nurse, "/api/nurses/fee-order", { kind: "REGISTRATION" });
    order = lastOrder();
    await success(order.order_id, order.order_amount, `pay_fmc_nurseok_${Date.now()}`);
    const np = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } });
    check("nurse registration: paying again at the right amount activates as before, wallet untouched",
      r.status === 200 && order.order_amount === 500 && np.registrationFeePaid && np.pendingOrderAmount === null &&
        (await prisma.nursePaymentLog.count({ where: { nurseId: nurse.id, type: "REGISTRATION" } })) === 1 && (await walletOf(nurse.id)).balance === nurseCredit,
      `${np.registrationFeePaid} balance ${(await walletOf(nurse.id)).balance}`);
  } finally {
    server?.kill("SIGTERM");
    mockServer.close();
    await prisma.platformSettings.update({ where: { id: settings.id }, data: before });
    await prisma.couponRedemption.deleteMany({ where: { userId: { in: ids } } });
    await prisma.coupon.deleteMany({ where: { code: { in: codes } } });
    await prisma.doctorPaymentLog.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.nursePaymentLog.deleteMany({ where: { nurseId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
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
