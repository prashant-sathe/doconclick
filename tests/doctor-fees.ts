// Doctor registration price (F44): the admin sets an original price and an
// optional discounted one. Both set → the doctor sees the original struck
// through and is charged the discounted price; discounted empty (null) or
// ≥ original → the original is shown and charged; an explicit ₹0 discount =
// free. Coupons apply on the charged price, the approve gate quotes it, and
// doctors who already paid are unaffected by a price change.
//
// Like test:nurse-fee-coupons, this starts its OWN dev server (MOCK_PORT env,
// default 3100, else a free port; tests/devServer.ts) with Cashfree pointed at
// an in-process mock and a test-only secret, so no real gateway order is ever
// created. Uses the DB in .env, throwaway users/coupons only; the doctor fee
// settings are put back afterwards.
//
//   npm run test:doctor-fees
import "dotenv/config";
import crypto from "crypto";
import http from "http";
import type { ChildProcess } from "child_process";
import type { AddressInfo } from "net";
import { startDevServer } from "./devServer";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { resolveDoctorRegistrationPricing } from "../src/lib/doctorFeePricing";

let MOCK_PORT = 0;
let BASE = "";
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

async function webhook(orderId: string, amount: number) {
  const body = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    event_time: new Date().toISOString(),
    data: { order: { order_id: orderId, order_amount: amount }, payment: { cf_payment_id: `pay_df_${Date.now()}`, payment_status: "SUCCESS" } },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(ts + body).digest("base64");
  return fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-signature": sig, "x-webhook-timestamp": ts }, body });
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
  const r = resolveDoctorRegistrationPricing;
  const eq = (a: ReturnType<typeof r>, o: number, p: number, d: boolean) => a.original === o && a.payable === p && a.hasDiscount === d;
  check("pure: ₹499 + ₹99 → ~~₹499~~ ₹99 charged", eq(r(499, 99), 499, 99, true), JSON.stringify(r(499, 99)));
  check("pure: ₹499 + no discount → ₹499 charged, no strike", eq(r(499, null), 499, 499, false), JSON.stringify(r(499, null)));
  check("pure: discount = original → no discount", eq(r(499, 499), 499, 499, false), JSON.stringify(r(499, 499)));
  check("pure: discount > original → no discount, original charged", eq(r(499, 600), 499, 499, false), JSON.stringify(r(499, 600)));
  check("pure: explicit ₹0 discount → free", eq(r(499, 0), 499, 0, true), JSON.stringify(r(499, 0)));
  check("pure: negative / NaN discount ignored", eq(r(499, -5), 499, 499, false) && eq(r(499, NaN), 499, 499, false), "ok");
  check("pure: missing original falls back to ₹499", eq(r(null, 99), 499, 99, true) && eq(r(null, null), 499, 499, false), JSON.stringify(r(null, 99)));
  check("pure: original ₹0 → free", eq(r(0, null), 0, 0, false) && eq(r(0, 99), 0, 0, false), JSON.stringify([r(0, null), r(0, 99)]));
}

async function main() {
  pure();
  await new Promise<void>((res) => mockServer.listen(0, "127.0.0.1", res));
  MOCK_PORT = (mockServer.address() as AddressInfo).port;
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  const codes: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `4${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const pending = (extra: Record<string, unknown> = {}) => ({ create: { status: "PENDING", registrationFeePaid: false, ...extra } });
  const admin = await mk({ name: "Fees Admin", role: "ADMIN" });
  const docA = await mk({ name: "Fees Doctor A", role: "DOCTOR", doctorProfile: pending() });
  const docB = await mk({ name: "Fees Doctor B", role: "DOCTOR", doctorProfile: pending() });
  const docC = await mk({ name: "Fees Doctor C", role: "DOCTOR", doctorProfile: pending({ medRegNo: `MMC-F${stamp}`, medRegCertUrl: "https://x/cert.pdf", kycDocUrl: "https://x/kyc.pdf" }) });
  const docD = await mk({ name: "Fees Doctor D", role: "DOCTOR", doctorProfile: pending() });
  const paidDoc = await mk({ name: "Fees Paid Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, registrationFeeStatus: "PAID" } } });
  const flat = `DF${stamp}`;
  codes.push(flat);
  await prisma.coupon.create({ data: { code: flat, discountType: "FLAT", discountValue: 50, appliesTo: "DOCTOR_REGISTRATION" } as never });

  const settings = await prisma.platformSettings.findFirst();
  if (!settings) throw new Error("no PlatformSettings row");
  const before = { doctorRegistrationOriginalFee: settings.doctorRegistrationOriginalFee, doctorRegistrationFee: settings.doctorRegistrationFee };
  const patch = (body: Record<string, unknown>) => call(admin, "PATCH", "/api/admin/settings", body);
  const lastOrder = () => mock.createdOrders[mock.createdOrders.length - 1];

  let server: ChildProcess | null = null;
  try {
    ({ child: server, base: BASE } = await startDevServer({
      label: "doctor-fees",
      env: { CASHFREE_API_BASE: `http://127.0.0.1:${MOCK_PORT}`, CASHFREE_APP_ID: "test-app", CASHFREE_SECRET_KEY: TEST_SECRET },
    }));
    await call(admin, "GET", "/api/admin/settings"); // compile

    // ── Admin validation ──
    for (const [label, body] of [
      ["original negative", { doctorRegistrationOriginalFee: -1 }],
      ["original as text", { doctorRegistrationOriginalFee: "499" }],
      ["original null", { doctorRegistrationOriginalFee: null }],
      ["discounted blank string", { doctorRegistrationFee: "" }],
      ["discounted = original", { doctorRegistrationOriginalFee: 499, doctorRegistrationFee: 499 }],
      ["discounted > original", { doctorRegistrationOriginalFee: 499, doctorRegistrationFee: 600 }],
    ] as const) {
      const r = await patch(body);
      check(`settings: ${label} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    let r = await patch({ doctorRegistrationOriginalFee: 499, doctorRegistrationFee: 99 });
    check("settings: original ₹499 + discounted ₹99 → saved", r.status === 200 && r.json.doctorRegistrationOriginalFee === 499 && r.json.doctorRegistrationFee === 99, `${r.status} ${JSON.stringify(r.json.error ?? "")}`);
    r = await patch({ doctorRegistrationOriginalFee: 80 });
    check("settings: lowering the original below the stored discount → 400", r.status === 400, `${r.status} ${r.json.error}`);

    // ── Both set: strike-through + discounted charged ──
    r = await call(docA, "GET", "/api/doctors/me");
    check("doctor sees ~~₹499~~ ₹99", r.json.registrationFee === 99 && r.json.registrationFeeOriginal === 499 && r.json.registrationFeeHasDiscount === true, JSON.stringify({ f: r.json.registrationFee, o: r.json.registrationFeeOriginal, d: r.json.registrationFeeHasDiscount }));
    r = await call(docA, "POST", "/api/doctors/registration-fee/create-order", {});
    const orderA = lastOrder();
    check("checkout → Cashfree order for ₹99", r.status === 200 && orderA?.order_amount === 99, `${r.status} ₹${orderA?.order_amount}`);
    r = await call(docB, "POST", "/api/coupons/validate", { code: flat, context: "DOCTOR_REGISTRATION" });
    check("coupon preview: ₹50 off the charged ₹99 → ₹49", r.status === 200 && r.json.netAmount === 49, `${r.status} ${JSON.stringify(r.json)}`);
    r = await call(docB, "POST", "/api/doctors/registration-fee/create-order", { code: flat });
    check("checkout with the coupon → order for ₹49", r.status === 200 && lastOrder()?.order_amount === 49, `${r.status} ₹${lastOrder()?.order_amount}`);
    await webhook(orderA.order_id, 99);
    let pA = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docA.id } });
    check("webhook at ₹99 → doctor A paid", pA.registrationFeePaid, `paid=${pA.registrationFeePaid}`);

    // ── Discount cleared: original shown and charged ──
    r = await patch({ doctorRegistrationOriginalFee: 499, doctorRegistrationFee: null });
    check("settings: discounted cleared (null) → saved as no discount", r.status === 200 && r.json.doctorRegistrationFee === null, `${r.status} ${r.json.doctorRegistrationFee}`);
    r = await call(docC, "GET", "/api/doctors/me");
    check("doctor sees ₹499, no strike-through", r.json.registrationFee === 499 && r.json.registrationFeeHasDiscount === false, JSON.stringify({ f: r.json.registrationFee, d: r.json.registrationFeeHasDiscount }));
    r = await call(docC, "POST", "/api/doctors/registration-fee/create-order", {});
    check("checkout → Cashfree order for ₹499", r.status === 200 && lastOrder()?.order_amount === 499, `${r.status} ₹${lastOrder()?.order_amount}`);
    r = await call(admin, "PATCH", `/api/admin/doctors/${docC.id}`, { status: "APPROVED" });
    check("approve gate quotes ₹499", r.status === 400 && String(r.json.error).includes("₹499"), `${r.status} ${r.json.error}`);

    // ── Existing paid doctors unaffected ──
    pA = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docA.id } });
    const logA = await prisma.doctorPaymentLog.findFirst({ where: { doctorId: docA.id, type: "REGISTRATION" } });
    check("doctor A (paid ₹99 earlier) still paid, log still ₹99", pA.registrationFeePaid && logA?.amount === 99, `paid=${pA.registrationFeePaid} log ₹${logA?.amount}`);
    const ordersBefore = mock.createdOrders.length;
    r = await call(paidDoc, "POST", "/api/doctors/registration-fee/create-order", {});
    const pPaid = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: paidDoc.id } });
    check("an already-paid doctor → 400, no new order, still paid", r.status === 400 && mock.createdOrders.length === ordersBefore && pPaid.registrationFeePaid, `${r.status}`);

    // ── Explicit ₹0 discount = free ──
    r = await patch({ doctorRegistrationOriginalFee: 0, doctorRegistrationFee: null });
    check("settings: original ₹0 (no discount) → saved", r.status === 200 && r.json.doctorRegistrationOriginalFee === 0, `${r.status} ${JSON.stringify(r.json.error ?? "")}`);
    r = await patch({ doctorRegistrationOriginalFee: 499, doctorRegistrationFee: 0 });
    check("settings: discounted ₹0 (entered) → saved", r.status === 200 && r.json.doctorRegistrationFee === 0, `${r.status}`);
    r = await call(docD, "POST", "/api/doctors/registration-fee/create-order", {});
    const pD = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: docD.id } });
    check("free: activated without a Cashfree order", r.status === 200 && r.json.paid === true && pD.registrationFeePaid && mock.createdOrders.length === ordersBefore, `${r.status} ${JSON.stringify(r.json)}`);
  } finally {
    server?.kill("SIGTERM");
    mockServer.close();
    await prisma.platformSettings.update({ where: { id: settings.id }, data: before });
    await prisma.couponRedemption.deleteMany({ where: { userId: { in: ids } } });
    await prisma.coupon.deleteMany({ where: { code: { in: codes } } });
    await prisma.doctorPaymentLog.deleteMany({ where: { doctorId: { in: ids } } });
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
