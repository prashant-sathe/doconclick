// Appointment payment settlement (BUG-TRACKER #12): PaymentOrder records,
// wallet credits for orphaned / mismatched / duplicate / non-SCHEDULED
// payments, and the verify-order fallback.
//
// Never touches the real Cashfree: this script starts its OWN dev server on
// port 3100 with CASHFREE_API_BASE pointed at an in-process mock and a
// test-only CASHFREE_SECRET_KEY (Next doesn't let .env override variables
// that are already set), and signs webhook bodies locally with that key.
// Uses throwaway users deleted afterwards. Stop any running `next dev` first
// — Next allows one dev server per project directory.
//
//   npm run test:payments
import "dotenv/config";
import crypto from "crypto";
import http from "http";
import { spawn, type ChildProcess } from "child_process";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const PORT = 3100;
const MOCK_PORT = 4010;
const BASE = `http://localhost:${PORT}`;
const TEST_SECRET = "test-only-cashfree-secret";
const JWT_SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// ── Mock Cashfree ──
const mock = {
  createdOrders: [] as { order_id: string; order_amount: number }[],
  payments: new Map<string, { cf_payment_id: string; payment_status: string; payment_amount: number }[]>(),
  hits: 0,
};
const mockServer = http.createServer((req, res) => {
  mock.hits++;
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/orders") {
      const o = JSON.parse(body);
      mock.createdOrders.push({ order_id: o.order_id, order_amount: o.order_amount });
      res.end(JSON.stringify({ payment_session_id: `sess_${o.order_id}`, cf_order_id: `cf_${o.order_id}` }));
      return;
    }
    const m = /^\/orders\/([^/]+)\/payments$/.exec(req.url ?? "");
    if (req.method === "GET" && m) {
      res.end(JSON.stringify(mock.payments.get(decodeURIComponent(m[1])) ?? []));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
});

async function startServer(): Promise<ChildProcess> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("AWS_")) delete env[k];
  Object.assign(env, {
    CASHFREE_API_BASE: `http://127.0.0.1:${MOCK_PORT}`,
    CASHFREE_APP_ID: "test-app",
    CASHFREE_SECRET_KEY: TEST_SECRET,
  });
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

let paymentSeq = 0;
async function webhook(orderId: string, amount: number, opts: { paymentId?: string; customerId?: string; badSignature?: boolean } = {}) {
  const paymentId = opts.paymentId ?? `pay_${Date.now()}_${++paymentSeq}`;
  const body = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    event_time: new Date().toISOString(),
    data: {
      order: { order_id: orderId, order_amount: amount },
      payment: { cf_payment_id: paymentId, payment_status: "SUCCESS" },
      ...(opts.customerId ? { customer_details: { customer_id: opts.customerId } } : {}),
    },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", opts.badSignature ? "wrong-key" : TEST_SECRET).update(ts + body).digest("base64");
  const r = await fetch(`${BASE}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-signature": sig, "x-webhook-timestamp": ts },
    body,
  });
  return { status: r.status, paymentId };
}

async function main() {
  await new Promise<void>((r) => mockServer.listen(MOCK_PORT, "127.0.0.1", r));
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
    return { status: r.status, orderId: mock.createdOrders[before]?.order_id ?? "" };
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
    await fetch(`${BASE}/api/payments/webhook`); // compile the route before timing-sensitive checks

    // ── create-order records a PaymentOrder and leaves cashfreeOrderId alone ──
    const a = await appt();
    const o1 = await createOrder(a.id);
    const o2 = await createOrder(a.id);
    const rec = await prisma.paymentOrder.findUnique({ where: { orderId: o1.orderId }, include: { items: true } });
    check("create-order records the order", o1.status === 200 && rec?.amount === 500 && rec.items.length === 1 && rec.items[0].amount === 500, `${o1.status}, amount ${rec?.amount}`);
    check("…and doesn't overwrite cashfreeOrderId", (await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } })).cashfreeOrderId === null, "still null");
    check("…amount sent to the (mock) gateway", mock.createdOrders.at(-1)?.order_amount === 500, `₹${mock.createdOrders.at(-1)?.order_amount}`);

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
    check("bad signature rejected", bad.status === 401, `${bad.status}`);

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
    mockServer.close();
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
