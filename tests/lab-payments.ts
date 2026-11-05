// Online (Cashfree) payment for lab bookings: create → checkout, webhook
// settle, verify fallback, pay-again, replaced/cancelled/mismatched payments
// credited to the wallet, cash refused.
//
// Never touches the real Cashfree: starts its OWN dev server (tests/devServer.ts,
// own distDir and port — the owner's `next dev` is left alone) with
// CASHFREE_API_BASE pointed at an in-process mock and a test-only secret that
// signs the webhook bodies. Throwaway users, deleted afterwards.
//
//   npm run test:lab-payments
import "dotenv/config";
import crypto from "crypto";
import http from "http";
import type { ChildProcess } from "child_process";
import type { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import { startDevServer } from "./devServer";
import { prisma } from "../src/lib/prisma";
import { labTestPrice } from "../src/lib/labTests";
import { collectionDays } from "../src/lib/labShare";

let BASE = "";
const TEST_SECRET = "test-only-cashfree-secret";
const JWT_SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const HOUR = 60 * 60_000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// ── Mock Cashfree ──
const mock = {
  orders: [] as { order_id: string; order_amount: number; return_url: string }[],
  payments: new Map<string, { cf_payment_id: string; payment_status: string; payment_amount: number }[]>(),
};
const mockServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/orders") {
      const o = JSON.parse(body);
      mock.orders.push({ order_id: o.order_id, order_amount: o.order_amount, return_url: o.order_meta?.return_url });
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

let seq = 0;
async function webhook(orderId: string, amount: number, paymentId = `pay_${Date.now()}_${++seq}`) {
  const body = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    event_time: new Date().toISOString(),
    data: { order: { order_id: orderId, order_amount: amount }, payment: { cf_payment_id: paymentId, payment_status: "SUCCESS" } },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(ts + body).digest("base64");
  const r = await fetch(`${BASE}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-signature": sig, "x-webhook-timestamp": ts },
    body,
  });
  return { status: r.status, paymentId };
}

async function main() {
  await new Promise<void>((r) => mockServer.listen(0, "127.0.0.1", r));
  const mockPort = (mockServer.address() as AddressInfo).port;
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `5${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const doctor = await mk({
    name: "LabPay Doctor", role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 24 * HOUR), qualification: "MBBS", medRegNo: `LP${stamp}` } },
  });
  const admin = await mk({ name: "LabPay Admin", role: "ADMIN" });
  const patient = await mk({ name: "LabPay Patient", role: "PATIENT", patientProfile: { create: { age: 40, gender: "Male", homeAddress: "4 Pay Street, Pune" } } });
  const wallet = await prisma.wallet.create({ data: { userId: patient.id, balance: 0 } });
  const balance = async () => (await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance;
  type U = { id: string; name: string | null; role: string; mobile: string };
  const call = async (u: U, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, JWT_SECRET)}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string } };
  };
  const lipid = await prisma.labTest.findFirst({ where: { name: "Lipid Profile", isActive: true } });
  if (!lipid) throw new Error("Lipid Profile missing from the lab catalogue — open /admin/lab-tests once to seed it");
  const price = labTestPrice(lipid);
  const visit = async () => {
    const a = await prisma.appointment.create({
      data: { doctorId: doctor.id, patientId: patient.id, status: "COMPLETED", completedAt: new Date(), scheduledAt: new Date(Date.now() - HOUR), symptoms: "fever", amount: 500, consultType: "VIDEO", paymentMethod: "CASH" } as never,
    });
    await prisma.prescriptionTest.create({ data: { appointmentId: a.id, name: "Lipid Profile", labTestId: lipid.id } });
    return a;
  };
  const book = (appointmentId: string, paymentMethod = "ONLINE") =>
    call(patient, "POST", "/api/lab-bookings", { appointmentId, labTestIds: [lipid.id], address: "4 Pay Street, Pune", pinCode: "411001", lat: 18.5204, lng: 73.8567, collectionDate: collectionDays()[1], collectionSlot: "09-11", paymentMethod });
  const row = (id: string) => prisma.labBooking.findUniqueOrThrow({ where: { id } });
  const lastOrder = () => mock.orders[mock.orders.length - 1];

  let server: ChildProcess | null = null;
  try {
    const started = await startDevServer({
      label: "lab-payments",
      env: { CASHFREE_API_BASE: `http://127.0.0.1:${mockPort}`, CASHFREE_APP_ID: "test-app", CASHFREE_SECRET_KEY: TEST_SECRET },
    });
    server = started.child;
    BASE = started.base;
    await fetch(`${BASE}/api/payments/webhook`); // compile before timing-sensitive checks

    // ── Book online → checkout → webhook ──
    const a = await visit();
    check("cash is refused", (await book(a.id, "CASH")).status === 400, "400");
    let r = await book(a.id);
    const b1 = r.json as { id: string; status: string; paymentSessionId: string; orderId: string };
    check("ONLINE → checkout session, booking awaiting payment", r.status === 200 && !!b1.paymentSessionId && b1.status === "PENDING_PAYMENT", `${r.status} ${r.json.error ?? b1.status}`);
    check("order id fits Cashfree's 45-character limit", b1.orderId.length <= 45, `${b1.orderId.length} chars`);
    check("order sent to the gateway for the booking total", lastOrder()?.order_id === b1.orderId && lastOrder()?.order_amount === price, JSON.stringify(lastOrder()));
    check("return URL brings them back to My lab tests", !!lastOrder()?.return_url.includes(`/patient/lab-tests?labOrder=${encodeURIComponent(b1.orderId)}&booking=${b1.id}`), lastOrder()?.return_url ?? "");
    r = await call(admin, "GET", "/api/admin/lab-bookings?status=ALL");
    check("admin sees it as Awaiting payment", ((r.json.bookings ?? []) as { id: string; status: string }[]).find((x) => x.id === b1.id)?.status === "PENDING_PAYMENT", "listed");
    r = await call(admin, "PATCH", `/api/admin/lab-bookings/${b1.id}`, { status: "CONFIRMED" });
    check("admin can't confirm before payment", r.status === 409, String(r.status));

    const w1 = await webhook(b1.orderId, price);
    let b = await row(b1.id);
    check("webhook → REQUESTED + PAID", w1.status === 200 && b.status === "REQUESTED" && b.paymentStatus === "PAID" && b.cfPaymentId === w1.paymentId, `${b.status} ${b.paymentStatus}`);
    await webhook(b1.orderId, price, w1.paymentId);
    check("webhook retry → no-op, no wallet credit", (await balance()) === 0, String(await balance()));
    await webhook(b1.orderId, price);
    check("a second payment on a paid booking → wallet credited in full", (await balance()) === price, String(await balance()));
    r = await call(patient, "POST", `/api/lab-bookings/${b1.id}/verify`, { orderId: b1.orderId });
    check("verify on a paid booking → PAID", r.status === 200 && r.json.status === "PAID", JSON.stringify(r.json));
    r = await book(a.id);
    check("can't book the same consultation twice once paid", r.status === 409, String(r.status));

    // ── Verify fallback (webhook never came) ──
    const v = await visit();
    r = await book(v.id);
    const b2 = r.json as { id: string; orderId: string };
    r = await call(patient, "POST", `/api/lab-bookings/${b2.id}/verify`, { orderId: b2.orderId });
    check("verify before paying → PENDING", r.json.status === "PENDING", JSON.stringify(r.json));
    mock.payments.set(b2.orderId, [{ cf_payment_id: `pay_v_${stamp}`, payment_status: "SUCCESS", payment_amount: price }]);
    r = await call(patient, "POST", `/api/lab-bookings/${b2.id}/verify`, { orderId: b2.orderId });
    b = await row(b2.id);
    check("verify settles a payment the webhook missed", r.json.status === "PAID" && b.status === "REQUESTED" && b.paymentStatus === "PAID", `${r.json.status} ${b.status}`);
    const balBefore = await balance();
    await webhook(b2.orderId, price, `pay_v_${stamp}`);
    check("late webhook after verify → no-op", (await balance()) === balBefore, String(await balance()));
    r = await call(patient, "POST", `/api/lab-bookings/${b2.id}/verify`, { orderId: b1.orderId });
    check("verify with another booking's order → 400", r.status === 400, String(r.status));

    // ── Pay again, abandoned checkout replaced, cancelled-then-paid ──
    const p = await visit();
    r = await book(p.id);
    const b3 = r.json as { id: string; orderId: string };
    r = await call(patient, "POST", `/api/lab-bookings/${b3.id}/pay`);
    const retry = r.json as { orderId: string; paymentSessionId: string };
    check("Pay now → a fresh order", r.status === 200 && retry.orderId !== b3.orderId && !!retry.paymentSessionId, `${r.status} ${retry.orderId}`);
    await webhook(b3.orderId, price); // the first (older) order still pays
    b = await row(b3.id);
    check("payment on the older order still settles the booking", b.status === "REQUESTED" && b.paymentStatus === "PAID", b.status);
    r = await call(patient, "POST", `/api/lab-bookings/${b3.id}/pay`);
    check("Pay now on a paid booking → 409", r.status === 409, String(r.status));

    const q = await visit();
    r = await book(q.id);
    const old = r.json as { id: string; orderId: string };
    r = await book(q.id); // walked away from the first checkout, booked again
    const fresh = r.json as { id: string };
    check("rebooking replaces the unpaid booking", r.status === 200 && (await row(old.id)).status === "CANCELLED" && (await row(old.id)).cancelledBy === "SYSTEM", (await row(old.id)).status);
    r = await call(patient, "GET", "/api/lab-bookings");
    check("…the replaced one isn't shown to the patient", !((r.json as unknown as { id: string }[]).some((x) => x.id === old.id)) && (r.json as unknown as { id: string }[]).some((x) => x.id === fresh.id), "hidden");
    let before = await balance();
    await webhook(old.orderId, price);
    check("a late payment on the replaced booking → wallet", (await balance()) === before + price && (await row(old.id)).status === "CANCELLED", String(await balance()));

    r = await call(patient, "POST", `/api/lab-bookings/${fresh.id}/cancel`);
    check("patient cancels an unpaid booking → nothing refunded", r.status === 200 && r.json.refunded === 0, JSON.stringify({ s: r.status, ref: r.json.refunded }));
    before = await balance();
    const freshOrder = (await row(fresh.id)).cashfreeOrderId!;
    await webhook(freshOrder, price);
    check("payment after cancelling → wallet", (await balance()) === before + price, String(await balance()));

    const m = await visit();
    r = await book(m.id);
    const mm = r.json as { id: string; orderId: string };
    before = await balance();
    await webhook(mm.orderId, price + 1);
    check("wrong amount → not applied, whole charge to the wallet", (await row(mm.id)).status === "PENDING_PAYMENT" && (await balance()) === before + price + 1, `${(await row(mm.id)).status} ${await balance()}`);

    // ── Paid online, then cancelled → wallet refund ──
    before = await balance();
    r = await call(patient, "POST", `/api/lab-bookings/${b2.id}/cancel`);
    check("cancel a paid online booking → refunded to wallet", r.status === 200 && r.json.refunded === price && (await balance()) === before + price, `${r.status} ${r.json.refunded}`);
    const credits = await prisma.walletTransaction.count({ where: { walletId: wallet.id, type: "PAYMENT_CREDIT" } });
    check("each unapplied payment credited exactly once", credits === 4, String(credits));
  } finally {
    server?.kill("SIGTERM");
    mockServer.close();
    await prisma.labBooking.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll lab payment checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
