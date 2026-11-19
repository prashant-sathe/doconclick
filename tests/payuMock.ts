// Shared PayU test double for the suites that start their OWN dev server
// (tests/devServer.ts). Never touches the real gateway:
//  - the spawned server gets PAYU_KEY/PAYU_SALT test values and PAYU_API_BASE
//    pointing at this in-process mock of PayU's verify_payment API
//    (`POST /merchant/postservice?form=2`);
//  - createPayuOrder makes no HTTP call (checkout is a signed form POST done by
//    the browser), so "created orders" are sniffed from the create-order API
//    responses (`checkout.fields`) via a global fetch wrapper
//    (`installOrderSniffer`), keeping the old `createdOrders[]` assertions;
//  - `sendPayuEvent` posts a hash-signed form to /api/payments/webhook or
//    /api/payments/payu-return, computing the reverse hash locally (an
//    independent check of src/lib/payu.ts).
import crypto from "crypto";
import http from "http";
import type { AddressInfo } from "net";

export const PAYU_TEST_KEY = "test-payu-key";
export const PAYU_TEST_SALT = "test-payu-salt";

const sha512 = (s: string) => crypto.createHash("sha512").update(s).digest("hex");

/** An order as the old Cashfree mock recorded it (field names kept on purpose). */
export interface MockOrder {
  order_id: string;
  order_amount: number;
  customer_details: { customer_id: string; customer_phone: string };
  order_meta: { return_url: string };
  return_url: string;
  fields: Record<string, string>;
}
/** A gateway payment the verify API should report for an order (old Cashfree shape). */
export interface MockPayment { cf_payment_id: string; payment_status: string; payment_amount: number }

export function createPayuMock() {
  const orders: MockOrder[] = [];
  const payments = new Map<string, MockPayment[]>();
  const state = { hits: 0, port: 0 };
  const server = http.createServer((req, res) => {
    state.hits++;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST" && req.url?.startsWith("/merchant/postservice")) {
        const p = new URLSearchParams(body);
        const txnid = p.get("var1") ?? "";
        const okHash = p.get("hash") === sha512(`${PAYU_TEST_KEY}|${p.get("command")}|${txnid}|${PAYU_TEST_SALT}`);
        if (p.get("command") !== "verify_payment" || p.get("key") !== PAYU_TEST_KEY || !okHash) {
          res.statusCode = 401;
          res.end(JSON.stringify({ status: 0, msg: "bad request" }));
          return;
        }
        const paid = (payments.get(txnid) ?? []).find((x) => x.payment_status === "SUCCESS");
        res.end(JSON.stringify(paid
          ? { status: 1, msg: "1 out of 1 Transactions Fetched Successfully", transaction_details: { [txnid]: { mihpayid: paid.cf_payment_id, status: "success", amt: paid.payment_amount.toFixed(2), transaction_amount: paid.payment_amount.toFixed(2) } } }
          : { status: 1, msg: "0 out of 1 Transactions Fetched Successfully", transaction_details: { [txnid]: { mihpayid: "Not Found", status: "Not Found" } } }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  return {
    orders,
    payments,
    state,
    server,
    async start(): Promise<number> {
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      state.port = (server.address() as AddressInfo).port;
      return state.port;
    },
    /** Env for startDevServer's `env` option. */
    env(extra: Record<string, string> = {}): Record<string, string> {
      return { PAYU_KEY: PAYU_TEST_KEY, PAYU_SALT: PAYU_TEST_SALT, PAYU_ENV: "sandbox", PAYU_API_BASE: `http://127.0.0.1:${state.port}`, ...extra };
    },
    /** Records every `checkout` the app's create-order routes hand back. */
    installOrderSniffer() {
      const real = globalThis.fetch;
      globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
        const res = await real(...args);
        if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) {
          const json = (await res.clone().json().catch(() => null)) as { checkout?: { fields?: Record<string, string> } } | null;
          const f = json?.checkout?.fields;
          if (f?.txnid) {
            const cb = new URL(f.surl);
            const ret = `${cb.origin}${cb.searchParams.get("next") ?? ""}`;
            orders.push({ order_id: f.txnid, order_amount: Number(f.amount), customer_details: { customer_id: f.udf1, customer_phone: f.phone }, order_meta: { return_url: ret }, return_url: ret, fields: f });
          }
        }
        return res;
      }) as typeof fetch;
    },
    close() { server.close(); },
  };
}

/** The forward (request) hash PayU expects for a checkout — recomputed independently. */
export function forwardHash(f: Record<string, string>): string {
  const g = (k: string) => f[k] ?? "";
  return sha512([PAYU_TEST_KEY, g("txnid"), g("amount"), g("productinfo"), g("firstname"), g("email"), g("udf1"), g("udf2"), g("udf3"), g("udf4"), g("udf5"), "", "", "", "", "", PAYU_TEST_SALT].join("|"));
}

/** A hash-signed PayU response/webhook form body. */
export function signedEventBody(orderId: string, amount: number, opts: { paymentId?: string; customerId?: string | null; status?: string; badSignature?: boolean; key?: string; salt?: string } = {}) {
  const KEY = opts.key ?? PAYU_TEST_KEY, SALT = opts.salt ?? PAYU_TEST_SALT;
  const paymentId = opts.paymentId ?? `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const f: Record<string, string> = {
    key: KEY, txnid: orderId, amount: amount.toFixed(2), productinfo: "DocOnClick", firstname: "Test", email: "t@example.com",
    udf1: opts.customerId ?? "", udf2: "", udf3: "", udf4: "", udf5: "", status: opts.status ?? "success", mihpayid: paymentId,
  };
  const hash = sha512([SALT, f.status, "", "", "", "", "", f.udf5, f.udf4, f.udf3, f.udf2, f.udf1, f.email, f.firstname, f.productinfo, f.amount, f.txnid, KEY].join("|"));
  f.hash = opts.badSignature ? "0".repeat(128) : hash;
  return { body: new URLSearchParams(f).toString(), paymentId };
}

/** POST a signed event to the webhook (default) or another path. Returns the HTTP status + payment id. */
export async function sendPayuEvent(
  base: string,
  orderId: string,
  amount: number,
  opts: { paymentId?: string; customerId?: string | null; status?: string; badSignature?: boolean; path?: string; redirect?: RequestRedirect; key?: string; salt?: string } = {},
) {
  const { body, paymentId } = signedEventBody(orderId, amount, opts);
  const r = await fetch(`${base}${opts.path ?? "/api/payments/webhook"}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: opts.redirect ?? "follow",
  });
  return { status: r.status, paymentId, location: r.headers.get("location") };
}
