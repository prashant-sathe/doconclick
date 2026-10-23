// Doctor platform-fee dues (src/lib/duesPayments.ts): a doctor who collected
// cash owes the platform its commission (net of online earnings). They pay it
// from Earnings through Cashfree; the payment settles exactly the visits
// snapshotted at checkout, and anything that changed meanwhile goes to the
// admin's review list instead of the wrong rows. Past the admin-set limit,
// cash walk-ins pause (online ones don't).
//
// Like test:payments, this starts its OWN dev server (MOCK_PORT env, default 3100, else a free port; tests/devServer.ts) with
// Cashfree pointed at an in-process mock and a test-only secret. Stop any
// running `next dev` first. Uses the DB in .env, throwaway users only; the
// admin's cash-due limit is restored afterwards.
//
//   npm run test:dues
import "dotenv/config";
import crypto from "crypto";
import http from "http";
import type { ChildProcess } from "child_process";
import type { AddressInfo } from "net";
import { startDevServer } from "./devServer";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

let MOCK_PORT = 0; // mock Cashfree: free port picked in main()
let BASE = ""; // set by startServer (MOCK_PORT env, default 3100, else a free port)
const TEST_SECRET = "test-only-cashfree-secret";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

const mock = { createdOrders: [] as { order_id: string; order_amount: number; order_meta: { return_url: string } }[], payments: new Map<string, unknown[]>() };
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
    const m = /^\/orders\/([^/]+)\/payments$/.exec(req.url ?? "");
    if (req.method === "GET" && m) { res.end(JSON.stringify(mock.payments.get(decodeURIComponent(m[1])) ?? [])); return; }
    res.statusCode = 404;
    res.end("{}");
  });
});

async function startServer(): Promise<ChildProcess> {
  const { child, base } = await startDevServer({
    label: "dues-payments",
    env: { CASHFREE_API_BASE: `http://127.0.0.1:${MOCK_PORT}`, CASHFREE_APP_ID: "test-app", CASHFREE_SECRET_KEY: TEST_SECRET },
  });
  BASE = base;
  return child;
}

async function webhook(orderId: string, amount: number, opts: { type?: string; paymentId?: string } = {}) {
  const paymentId = opts.paymentId ?? `pay_dues_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const body = JSON.stringify({
    type: opts.type ?? "PAYMENT_SUCCESS_WEBHOOK",
    event_time: new Date().toISOString(),
    data: { order: { order_id: orderId, order_amount: amount }, payment: { cf_payment_id: paymentId, payment_status: opts.type ? "FAILED" : "SUCCESS" } },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(ts + body).digest("base64");
  const r = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-signature": sig, "x-webhook-timestamp": ts }, body });
  return { status: r.status, paymentId };
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}

async function main() {
  await new Promise<void>((r) => mockServer.listen(0, "127.0.0.1", r));
  MOCK_PORT = (mockServer.address() as AddressInfo).port;
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mob = () => `7${stamp}${String(n++).padStart(2, "0")}`;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: mob(), termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const doctorProfile = { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), consultFee: 500, offersClinic: true } };
  const doctor = await mk({ name: "Dues Doctor", role: "DOCTOR", doctorProfile });
  const doctor2 = await mk({ name: "Dues Doctor Two", role: "DOCTOR", doctorProfile });
  const clean = await mk({ name: "Clean Doctor", role: "DOCTOR", doctorProfile });
  const lapsed = await mk({ name: "Lapsed Doctor", role: "DOCTOR", doctorProfile: { create: { ...doctorProfile.create, trialEndsAt: new Date(Date.now() - DAY) } } });
  const desk = await mk({ name: "Dues Desk", role: "STAFF" });
  await prisma.staffProfile.create({ data: { userId: desk.id, doctorId: doctor.id } });
  const admin = await mk({ name: "Dues Admin", role: "ADMIN" });
  const patient = await mk({ name: "Dues Patient", role: "PATIENT", password: "x", patientProfile: { create: { age: 30, gender: "Male" } } });

  // A completed, paid visit — cash: the doctor owes ₹50; online: owed ₹450.
  const visit = (doctorId: string, paymentMethod: "CASH" | "ONLINE") =>
    prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId, symptoms: "DUES-TEST", status: "COMPLETED", completedAt: new Date(),
        paymentMethod, paymentStatus: "PAID", paidAt: new Date(), amount: 500, platformFee: 50,
        scheduledAt: new Date(Date.now() - DAY - Math.floor(Math.random() * 1e7)),
      },
    });
  const walkIn = (as: U, paymentMethod: "CASH" | "ONLINE") =>
    call(as, "POST", "/api/doctor/walk-in-appointments", { mobile: patient.mobile, consultType: "CLINIC", symptoms: "Walk-in check", paymentMethod, consentGiven: true, force: true });

  const original = await prisma.platformSettings.findFirst();
  let server: ChildProcess | null = null;
  try {
    server = await startServer();
    await call(doctor, "GET", "/api/doctor/dues");
    await fetch(`${BASE}/api/payments/webhook`);

    // ── Admin limit ──
    let r = await call(admin, "PATCH", "/api/admin/settings", { cashDueLimit: -5 });
    check("admin: negative limit → 400", r.status === 400, `${r.status}`);
    r = await call(admin, "PATCH", "/api/admin/settings", { cashDueLimit: "abc" });
    check("admin: non-number limit → 400", r.status === 400, `${r.status}`);
    r = await call(admin, "PATCH", "/api/admin/settings", { cashDueLimit: 150 });
    check("admin sets the limit to ₹150", r.status === 200 && r.json.cashDueLimit === 150, `${r.status} ${r.json.cashDueLimit}`);
    r = await call(doctor, "PATCH", "/api/admin/settings", { cashDueLimit: 0 });
    check("…a doctor can't change it → 403", r.status === 403, `${r.status}`);

    // ── Owing ──
    for (let i = 0; i < 4; i++) await visit(doctor.id, "CASH");
    r = await call(doctor, "GET", "/api/doctor/dues");
    check("4 cash visits → owes ₹200, over the ₹150 limit", r.status === 200 && r.json.owed === 200 && r.json.cashBlocked === true && r.json.limit === 150, JSON.stringify(r.json));
    r = await call(desk, "GET", "/api/doctor/dues");
    check("…staff can't see the doctor's dues → 403", r.status === 403, `${r.status}`);

    r = await walkIn(desk, "CASH");
    check("cash walk-in over the limit → 403 CASH_DUE_LIMIT (staff wording)", r.status === 403 && r.json.code === "CASH_DUE_LIMIT" && /The doctor owes/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    r = await walkIn(doctor, "CASH");
    check("…doctor's own wording points at Earnings", r.status === 403 && /Pay it from Earnings/.test(String(r.json.error)), `${r.status}`);
    r = await walkIn(desk, "ONLINE");
    const onlineWalkIn = (r.json.appointment as J)?.id;
    check("online walk-in still works → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(desk, "PATCH", `/api/doctor/appointments/${onlineWalkIn}/payment-method`, { paymentMethod: "CASH" });
    check("switching a walk-in to cash over the limit → 403", r.status === 403 && r.json.code === "CASH_DUE_LIMIT", `${r.status}`);
    r = await call(desk, "GET", "/api/doctor/walk-in-appointments");
    check("walk-in form context says cash is paused", typeof r.json.cashBlocked === "string", String(r.json.cashBlocked));

    // ── Who can pay ──
    r = await call(desk, "POST", "/api/doctor/dues/create-order");
    check("staff can't start a dues payment → 403", r.status === 403, `${r.status}`);
    r = await call(clean, "POST", "/api/doctor/dues/create-order");
    check("a doctor who owes nothing → 400", r.status === 400, `${r.status} ${r.json.error}`);
    await visit(clean.id, "ONLINE");
    await visit(clean.id, "CASH");
    r = await call(clean, "POST", "/api/doctor/dues/create-order");
    check("…nor one whose online earnings cover the cash fee → 400", r.status === 400, `${r.status} ${r.json.error}`);

    // ── Paying, while another visit completes ──
    let before = mock.createdOrders.length;
    r = await call(doctor, "POST", "/api/doctor/dues/create-order");
    const order1 = mock.createdOrders[before];
    const dp1 = await prisma.duesPayment.findUnique({ where: { orderId: order1?.order_id ?? "" } });
    check("create-order → a ₹200 gateway order", r.status === 200 && r.json.amount === 200 && order1?.order_amount === 200 && order1.order_id.startsWith(`docdue${doctor.id}_`), `${r.status} ${r.json.error ?? ""}`);
    check("…snapshots the 4 visits it covers, returns to Earnings", dp1?.status === "CREATED" && JSON.parse(dp1.appointmentIds).length === 4 && order1.order_meta.return_url.includes("/doctor/earnings?duesOrder="), `${dp1?.appointmentIds}`);
    const late = await visit(doctor.id, "CASH");
    await webhook(order1.order_id, 200, { type: "PAYMENT_FAILED_WEBHOOK" });
    check("a failed attempt → FAILED", (await prisma.duesPayment.findUniqueOrThrow({ where: { id: dp1!.id } })).status === "FAILED", "FAILED");
    const w1 = await webhook(order1.order_id, 200);
    const dp1After = await prisma.duesPayment.findUniqueOrThrow({ where: { id: dp1!.id } });
    const settlement = dp1After.settlementId ? await prisma.settlement.findUnique({ where: { id: dp1After.settlementId }, include: { appointments: { select: { id: true } } } }) : null;
    check("…then the successful one → PAID and settled", w1.status === 200 && dp1After.status === "PAID" && !!settlement, `${dp1After.status} settlement=${!!settlement}`);
    check("…settlement covers exactly the 4 snapshotted visits, net −₹200", settlement?.appointments.length === 4 && settlement.netAmount === -200 && settlement.cashFeeOwed === 200 && !settlement.appointments.some((a) => a.id === late.id), `${settlement?.appointments.length} rows, net ${settlement?.netAmount}`);
    check("…the visit completed after checkout is still owed", (await prisma.appointment.findUniqueOrThrow({ where: { id: late.id } })).settlementId === null, "unsettled");
    r = await call(doctor, "GET", "/api/doctor/dues");
    check("now owes ₹50, cash unpaused", r.json.owed === 50 && r.json.cashBlocked === false, JSON.stringify(r.json));
    r = await walkIn(desk, "CASH");
    check("cash walk-in works again → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    await webhook(order1.order_id, 200, { paymentId: w1.paymentId });
    check("webhook retry → still one settlement", (await prisma.settlement.count({ where: { doctorId: doctor.id } })) === 1, `${await prisma.settlement.count({ where: { doctorId: doctor.id } })}`);
    r = await call(doctor, "POST", "/api/doctor/dues/verify", { orderId: order1.order_id });
    check("verify on a settled order → SETTLED", r.json.status === "SETTLED", String(r.json.status));
    r = await call(doctor2, "POST", "/api/doctor/dues/verify", { orderId: order1.order_id });
    check("…another doctor's order → 404", r.status === 404, `${r.status}`);

    // ── Verify fallback (webhook lost) ──
    before = mock.createdOrders.length;
    await call(doctor, "POST", "/api/doctor/dues/create-order");
    const order2 = mock.createdOrders[before];
    r = await call(doctor, "POST", "/api/doctor/dues/verify", { orderId: order2.order_id });
    check("verify before paying → PENDING", r.json.status === "PENDING", String(r.json.status));
    mock.payments.set(order2.order_id, [{ cf_payment_id: `pay_dv_${stamp}`, payment_status: "SUCCESS", payment_amount: 50 }]);
    r = await call(doctor, "POST", "/api/doctor/dues/verify", { orderId: order2.order_id });
    check("verify after paying → SETTLED, nothing owed", r.json.status === "SETTLED" && (await call(doctor, "GET", "/api/doctor/dues")).json.owed === 0, String(r.json.status));

    // ── Settled some other way meanwhile → review ──
    for (let i = 0; i < 2; i++) await visit(doctor2.id, "CASH");
    before = mock.createdOrders.length;
    await call(doctor2, "POST", "/api/doctor/dues/create-order");
    const order3 = mock.createdOrders[before];
    r = await call(admin, "POST", "/api/admin/finance/settlements", { doctorId: doctor2.id, acknowledgeNegative: true });
    check("admin settles the same visits by hand first", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    await webhook(order3.order_id, 100);
    const dp3 = await prisma.duesPayment.findUniqueOrThrow({ where: { orderId: order3.order_id } });
    check("…the doctor's payment lands → PAID, not applied", dp3.status === "PAID" && dp3.settlementId === null && (await prisma.settlement.count({ where: { doctorId: doctor2.id } })) === 1, `${dp3.status} settlement=${dp3.settlementId}`);
    r = await call(doctor2, "GET", "/api/doctor/dues");
    check("…the doctor sees it's waiting on the admin", r.json.inReview === 1, String(r.json.inReview));
    r = await call(doctor2, "POST", "/api/doctor/dues/verify", { orderId: order3.order_id });
    check("…verify says REVIEW", r.json.status === "REVIEW", String(r.json.status));
    r = await call(admin, "GET", "/api/admin/finance/dues-payments");
    const review = (r.json as unknown as { id: string; amount: number; doctorId: string }[]);
    check("admin's review list has it", r.status === 200 && Array.isArray(review) && review.some((x) => x.id === dp3.id && x.amount === 100), `${r.status}`);
    r = await call(doctor, "GET", "/api/admin/finance/dues-payments");
    check("…a doctor can't read that list → 403", r.status === 403, `${r.status}`);
    r = await call(admin, "PATCH", "/api/admin/finance/dues-payments", { id: dp3.id });
    check("admin marks it resolved → off the list", r.status === 200 && !((await call(admin, "GET", "/api/admin/finance/dues-payments")).json as unknown as { id: string }[]).some((x) => x.id === dp3.id), `${r.status}`);
    r = await call(admin, "PATCH", "/api/admin/finance/dues-payments", { id: dp3.id });
    check("…twice → 409", r.status === 409, `${r.status}`);

    // ── Charged a different amount → review ──
    await visit(doctor2.id, "CASH");
    before = mock.createdOrders.length;
    await call(doctor2, "POST", "/api/doctor/dues/create-order");
    const order4 = mock.createdOrders[before];
    await webhook(order4.order_id, 49);
    const dp4 = await prisma.duesPayment.findUniqueOrThrow({ where: { orderId: order4.order_id } });
    check("amount mismatch → PAID, not applied", dp4.status === "PAID" && dp4.settlementId === null, `${dp4.status}`);

    // ── Plan lapsed: still able to pay ──
    for (let i = 0; i < 3; i++) await visit(lapsed.id, "CASH");
    r = await call(lapsed, "GET", "/api/doctor/dues");
    check("expired plan: dues still readable (owes ₹150)", r.status === 200 && r.json.owed === 150, `${r.status} ${JSON.stringify(r.json).slice(0, 80)}`);
    before = mock.createdOrders.length;
    r = await call(lapsed, "POST", "/api/doctor/dues/create-order", { returnTo: "subscribe" });
    const order5 = mock.createdOrders[before];
    check("…can start the payment, returning to /doctor/subscribe", r.status === 200 && !!order5 && order5.order_meta.return_url.includes("/doctor/subscribe?duesOrder="), `${r.status} ${order5?.order_meta.return_url ?? r.json.error}`);
    await webhook(order5.order_id, 150);
    r = await call(lapsed, "POST", "/api/doctor/dues/verify", { orderId: order5.order_id });
    check("…and it settles", r.json.status === "SETTLED" && (await call(lapsed, "GET", "/api/doctor/dues")).json.owed === 0, String(r.json.status));
    const page = await fetch(`${BASE}/doctor/subscribe`, { headers: { Cookie: cookieFor(lapsed) }, redirect: "manual" });
    check("/doctor/subscribe opens for the lapsed doctor", page.status === 200, `${page.status}`);

    // ── No limit ──
    for (let i = 0; i < 10; i++) await visit(doctor.id, "CASH");
    await call(admin, "PATCH", "/api/admin/settings", { cashDueLimit: 0 });
    r = await call(doctor, "GET", "/api/doctor/dues");
    check("limit ₹0 = no limit: owes ₹500, not blocked", r.json.owed === 500 && r.json.cashBlocked === false, JSON.stringify(r.json));
    r = await walkIn(desk, "CASH");
    check("…cash walk-in allowed", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
  } finally {
    server?.kill("SIGTERM");
    mockServer.close();
    if (original) await prisma.platformSettings.update({ where: { id: original.id }, data: { cashDueLimit: original.cashDueLimit } });
    await prisma.duesPayment.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.paymentOrder.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.settlement.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.staffProfile.deleteMany({ where: { OR: [{ userId: { in: ids } }, { doctorId: { in: ids } }] } });
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
