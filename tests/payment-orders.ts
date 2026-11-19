// Appointment payment settlement (BUG-TRACKER #12): PaymentOrder records,
// wallet credits for orphaned / mismatched / duplicate / non-SCHEDULED
// payments, and the verify-order fallback.
//
// Never touches the real PayU: this script starts its OWN dev server on
// a free port (MOCK_PORT env, default 3100; tests/devServer.ts) with PAYU_API_BASE pointed at an in-process mock and a
// test-only PAYU_KEY/PAYU_SALT (Next doesn't let .env override variables
// that are already set), and signs webhook forms locally with that salt.
// Uses throwaway users deleted afterwards. Stop any running `next dev` first
// — Next allows one dev server per project directory.
//
//   npm run test:payments
import "dotenv/config";
import type { ChildProcess } from "child_process";
import { startDevServer } from "./devServer";
import { createPayuMock, sendPayuEvent, forwardHash, signedEventBody } from "./payuMock";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

let BASE = ""; // set by startServer (MOCK_PORT env, default 3100, else a free port)
const JWT_SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// ── Mock PayU ──
const pm = createPayuMock();
const mock = { createdOrders: pm.orders, payments: pm.payments, get hits() { return pm.state.hits; } };

async function startServer(): Promise<ChildProcess> {
  const { child, base } = await startDevServer({ label: "payment-orders", env: pm.env() });
  BASE = base;
  return child;
}

async function webhook(orderId: string, amount: number, opts: { paymentId?: string; customerId?: string; badSignature?: boolean; status?: string } = {}) {
  return sendPayuEvent(BASE, orderId, amount, opts);
}

async function main() {
  await pm.start();
  pm.installOrderSniffer();
  const stamp = String(Date.now()).slice(-9);
  const patient = await prisma.user.create({ data: { name: "Pay Test Patient", mobile: "6" + stamp, role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } } });
  const doctor = await prisma.user.create({ data: { name: "Pay Test Doctor", mobile: "7" + stamp, role: "DOCTOR" } });
  const cookie = `doconclick_token=${jwt.sign({ id: patient.id, name: patient.name, role: "PATIENT", mobile: patient.mobile, tv: 0 }, JWT_SECRET)}`;

  const appt = (amount = 500, discountAmount = 0) =>
    prisma.appointment.create({
      data: { patientId: patient.id, doctorId: doctor.id, symptoms: "PAY-ORDER-TEST", status: "SCHEDULED", paymentMethod: "ONLINE", amount, discountAmount },
    });
  const createOrder = async (appointmentId: string) => {
    const before = mock.createdOrders.length;
    const r = await fetch(`${BASE}/api/payments/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ appointmentId }),
    });
    const json = (await r.json().catch(() => ({}))) as { checkout?: { action: string; fields: Record<string, string> } };
    return { status: r.status, orderId: mock.createdOrders[before]?.order_id ?? "", checkout: json.checkout };
  };
  const verify = async (apptId: string) => {
    const r = await fetch(`${BASE}/api/payments/verify-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ apptId }),
    });
    return (await r.json()) as { paymentStatus: string; creditedAmount?: number };
  };
  const paid = async (id: string) => (await prisma.appointment.findUniqueOrThrow({ where: { id } })).paymentStatus === "PAID";
  const balance = async () => (await prisma.wallet.findUnique({ where: { userId: patient.id } }))?.balance ?? 0;
  const credits = (paymentId: string) => prisma.walletTransaction.count({ where: { creditOfPaymentId: paymentId } });

  let server: ChildProcess | null = null;
  try {
    server = await startServer();
    await fetch(`${BASE}/api/payments/webhook`); // compile the routes before timing-sensitive checks
    await fetch(`${BASE}/api/payments/payu-return`, { redirect: "manual" });

    // ── create-order records a PaymentOrder and leaves cashfreeOrderId alone ──
    const a = await appt();
    const o1 = await createOrder(a.id);
    const o2 = await createOrder(a.id);
    const rec = await prisma.paymentOrder.findUnique({ where: { orderId: o1.orderId }, include: { items: true } });
    check("create-order records the order", o1.status === 200 && rec?.amount === 500 && rec.items.length === 1 && rec.items[0].amount === 500, `${o1.status}, amount ${rec?.amount}`);
    check("…and doesn't overwrite cashfreeOrderId", (await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } })).cashfreeOrderId === null, "still null");
    check("…amount sent to the (mock) gateway", mock.createdOrders.at(-1)?.order_amount === 500, `₹${mock.createdOrders.at(-1)?.order_amount}`);
    const fields = mock.createdOrders.at(-1)?.fields ?? {};
    check("checkout is a PayU form POST with the customer's details", !!o1.checkout?.action?.includes("payu.in") && fields.udf1 === patient.id && fields.phone === patient.mobile.slice(-10) && fields.amount === "500.00" && fields.surl === fields.furl && fields.surl.includes("/api/payments/payu-return?next="), JSON.stringify({ action: o1.checkout?.action, phone: fields.phone, udf1: fields.udf1 }));
    check("…and its request hash matches key|txnid|amount|…|salt (SHA-512)", fields.hash === forwardHash(fields), `${fields.hash?.slice(0, 12)}…`);

    // ── Retry scenario: the OLDER order gets paid → still applied ──
    const w1 = await webhook(o1.orderId, 500);
    check("payment on the older order is applied", w1.status === 200 && (await paid(a.id)), `appointment PAID`);
    // ── …then the newer order is paid too → duplicate → wallet ──
    let bal = await balance();
    const w2 = await webhook(o2.orderId, 500);
    check("duplicate payment credited to wallet", (await balance()) - bal === 500 && (await credits(w2.paymentId)) === 1, `+₹${(await balance()) - bal}`);
    bal = await balance();
    await webhook(o2.orderId, 500, { paymentId: w2.paymentId });
    await webhook(o1.orderId, 500, { paymentId: w1.paymentId });
    check("webhook retries change nothing", (await balance()) === bal && (await credits(w2.paymentId)) === 1, "balance unchanged");

    // ── Concurrent deliveries of one duplicate payment ──
    const b = await appt();
    const ob1 = await createOrder(b.id);
    const ob2 = await createOrder(b.id);
    await webhook(ob1.orderId, 500);
    bal = await balance();
    const dupId = `pay_dup_${stamp}`;
    await Promise.all(Array.from({ length: 6 }, () => webhook(ob2.orderId, 500, { paymentId: dupId })));
    check("6 concurrent deliveries credit once", (await balance()) - bal === 500 && (await credits(dupId)) === 1, `+₹${(await balance()) - bal}, ${await credits(dupId)} credit row`);

    // ── Appointment no longer SCHEDULED ──
    const c = await appt();
    const oc = await createOrder(c.id);
    await prisma.appointment.update({ where: { id: c.id }, data: { status: "CANCELLED" } });
    bal = await balance();
    await webhook(oc.orderId, 500);
    check("payment for a cancelled appointment → wallet", (await balance()) - bal === 500 && !(await paid(c.id)), `+₹${(await balance()) - bal}, not PAID`);

    // ── Charged amount ≠ order amount ──
    const d = await appt();
    const od = await createOrder(d.id);
    bal = await balance();
    await webhook(od.orderId, 450);
    check("amount mismatch → full charge to wallet", (await balance()) - bal === 450 && !(await paid(d.id)), `+₹${(await balance()) - bal}, not PAID`);

    // ── Coupon applied after the order (owes less) → PAID + excess credited ──
    const e = await appt();
    const oe = await createOrder(e.id);
    await prisma.appointment.update({ where: { id: e.id }, data: { discountAmount: 100 } });
    bal = await balance();
    await webhook(oe.orderId, 500);
    check("overpaid after coupon → PAID + ₹100 credited", (await paid(e.id)) && (await balance()) - bal === 100, `+₹${(await balance()) - bal}`);

    // ── Coupon removed after the order (owes more) → unpaid, all credited ──
    const f = await appt(500, 100);
    const of = await createOrder(f.id);
    await prisma.appointment.update({ where: { id: f.id }, data: { discountAmount: 0 } });
    bal = await balance();
    await webhook(of.orderId, 400);
    check("underpaid after coupon change → unpaid, ₹400 credited", !(await paid(f.id)) && (await balance()) - bal === 400, `+₹${(await balance()) - bal}`);

    // ── Multi-visit order, one visit cancelled meanwhile → PARTIAL ──
    const g1 = await appt(300), g2 = await appt(200);
    const orderG = `appt${g1.id}_${Date.now()}`;
    await prisma.paymentOrder.create({
      data: { orderId: orderG, patientId: patient.id, amount: 500, items: { create: [{ appointmentId: g1.id, amount: 300 }, { appointmentId: g2.id, amount: 200 }] } },
    });
    await prisma.appointment.update({ where: { id: g2.id }, data: { status: "CANCELLED" } });
    bal = await balance();
    await webhook(orderG, 500);
    const og = await prisma.paymentOrder.findUniqueOrThrow({ where: { orderId: orderG } });
    check("package: live visit PAID, cancelled share credited", (await paid(g1.id)) && !(await paid(g2.id)) && (await balance()) - bal === 200 && og.status === "PARTIAL", `+₹${(await balance()) - bal}, order ${og.status}`);

    // ── Legacy orders (created before PaymentOrder existed) ──
    const h = await appt();
    await prisma.appointment.update({ where: { id: h.id }, data: { cashfreeOrderId: `appt${h.id}_999` } }); // overwritten by a later retry
    await webhook(`appt${h.id}_111`, 500);
    check("legacy orphan order adopted via its embedded id → PAID", await paid(h.id), "PAID");
    bal = await balance();
    await webhook(`apptnope_${stamp}`, 250, { customerId: patient.id });
    check("unknown order with our customer id → wallet", (await balance()) - bal === 250, `+₹${(await balance()) - bal}`);
    const un = await webhook(`apptnope2_${stamp}`, 250);
    check("unattributable order acked, nothing credited", un.status === 200 && (await credits(un.paymentId)) === 0, `${un.status}`);

    // ── Signature ──
    const bad = await webhook(`appt${h.id}_222`, 500, { badSignature: true });
    check("bad hash rejected", bad.status === 401, `${bad.status}`);
    const wrongKey = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: signedEventBody(`appt${h.id}_223`, 500).body.replace("key=test-payu-key", "key=other") });
    check("webhook for a different merchant key rejected", wrongKey.status === 401, `${wrongKey.status}`);
    check("unsigned (no hash) webhook rejected", (await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "txnid=x&status=success&amount=1.00" })).status === 401, "401");

    // ── Browser return (surl/furl): settles, then 303s to the app's own page ──
    const k = await appt();
    const ok = await createOrder(k.id);
    const next = `/patient/payment/return?apptId=${k.id}`;
    const ret = await sendPayuEvent(BASE, ok.orderId, 500, { customerId: patient.id, path: `/api/payments/payu-return?next=${encodeURIComponent(next)}`, redirect: "manual" });
    const loc = ret.location ? new URL(ret.location, BASE) : null;
    check("payu-return POST settles the appointment and 303s back", ret.status === 303 && (await paid(k.id)) && loc?.origin === new URL(BASE).origin && loc.pathname + loc.search === next, `${ret.status} ${ret.location}`);
    const evil = await sendPayuEvent(BASE, `appt${k.id}_333`, 500, { path: "/api/payments/payu-return?next=%2F%2Fevil.com%2Fx", redirect: "manual" });
    check("payu-return ?next=//evil.com → redirected to /, never off-site", evil.status === 303 && new URL(evil.location ?? "", BASE).origin === new URL(BASE).origin && new URL(evil.location ?? "", BASE).pathname === "/", `${evil.status} ${evil.location}`);
    const forged = await sendPayuEvent(BASE, ok.orderId, 500, { badSignature: true, path: `/api/payments/payu-return?next=${encodeURIComponent(next)}`, redirect: "manual" });
    check("payu-return with a bad hash still redirects but settles nothing", forged.status === 303 && (await credits(forged.paymentId)) === 0, `${forged.status}`);

    // ── Failure callback for a wallet top-up marks it FAILED ──
    const wallet = await prisma.wallet.upsert({ where: { userId: patient.id }, update: {}, create: { userId: patient.id, balance: 0 } });
    const topupOrder = `wallettopup${patient.id}_${Date.now()}`;
    const txn = await prisma.walletTransaction.create({ data: { walletId: wallet.id, type: "TOPUP", amount: 300, balanceAfter: wallet.balance, status: "PENDING", cashfreeOrderId: topupOrder } });
    const failed = await webhook(topupOrder, 300, { status: "failure", paymentId: `pay_fail_${stamp}` });
    check("failure-status webhook marks the PENDING top-up FAILED", failed.status === 200 && (await prisma.walletTransaction.findUniqueOrThrow({ where: { id: txn.id } })).status === "FAILED", `${failed.status}`);
    await prisma.walletTransaction.deleteMany({ where: { id: txn.id } });

    // ── verify-order fallback ──
    const i = await appt();
    const oi = await createOrder(i.id);
    check("verify-order with no payment yet → PENDING", (await verify(i.id)).paymentStatus === "PENDING", "PENDING");
    const iPay = `pay_verify_${stamp}`;
    mock.payments.set(oi.orderId, [{ cf_payment_id: "pay_failed_attempt", payment_status: "FAILED", payment_amount: 500 }, { cf_payment_id: iPay, payment_status: "SUCCESS", payment_amount: 500 }]);
    const hitsBefore = mock.hits;
    const vi = await verify(i.id);
    check("verify-order settles a paid order the webhook missed", vi.paymentStatus === "PAID" && (await paid(i.id)) && mock.hits > hitsBefore, `${vi.paymentStatus}, mock hit`);
    bal = await balance();
    await webhook(oi.orderId, 500, { paymentId: iPay });
    check("late webhook after verify-order is a no-op", (await balance()) === bal && (await credits(iPay)) === 0, "no credit");

    const j = await appt();
    const oj = await createOrder(j.id);
    await prisma.appointment.update({ where: { id: j.id }, data: { status: "CANCELLED" } });
    mock.payments.set(oj.orderId, [{ cf_payment_id: `pay_verify2_${stamp}`, payment_status: "SUCCESS", payment_amount: 500 }]);
    const vj = await verify(j.id);
    check("verify-order on a cancelled visit → CREDITED", vj.paymentStatus === "CREDITED" && vj.creditedAmount === 500, `${vj.paymentStatus} ₹${vj.creditedAmount}`);
  } finally {
    server?.kill("SIGTERM");
    pm.close();
    await prisma.paymentOrder.deleteMany({ where: { patientId: patient.id } });
    await prisma.wallet.deleteMany({ where: { userId: patient.id } });
    await prisma.appointment.deleteMany({ where: { patientId: patient.id } });
    await prisma.patientProfile.deleteMany({ where: { userId: patient.id } });
    await prisma.user.deleteMany({ where: { id: { in: [patient.id, doctor.id] } } });
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
