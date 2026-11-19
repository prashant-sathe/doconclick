import crypto from "crypto";

// The registration fee is admin-set (PlatformSettings.doctorRegistrationFee =
// the discounted price charged, doctorRegistrationOriginalFee = the original;
// resolved in src/lib/doctorFees.ts); this is only the discount's default. The subscription
// fee is shared with the webhook's amount-match check — keep in one place.
export const DEFAULT_DOCTOR_REGISTRATION_FEE = 99;
export const DOCTOR_SUBSCRIPTION_FEE = 499;

// PayU (India). Checkout is a signed form POST to PayU's hosted page; the
// result comes back as a form POST to our surl/furl (and, if enabled in the
// PayU dashboard, a server-to-server webhook), both signed with the merchant
// salt. PAYU_API_BASE points at a local mock in tests (tests/payment-orders.ts)
// so they never reach the real gateway. Never set it in production.
const sandbox = () => process.env.PAYU_ENV === "sandbox";
const PAYU_CHECKOUT_URL = () => (sandbox() ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment");
const PAYU_INFO_BASE = () => process.env.PAYU_API_BASE ?? (sandbox() ? "https://test.payu.in" : "https://info.payu.in");

function credentials() {
  const key = process.env.PAYU_KEY;
  const salt = process.env.PAYU_SALT;
  if (!key || !salt) throw new Error("PayU is not configured (PAYU_KEY / PAYU_SALT missing)");
  return { key, salt };
}

const sha512 = (s: string) => crypto.createHash("sha512").update(s).digest("hex");

// A PayU checkout: POST `fields` to `action` (see src/lib/payuCheckout.ts).
export interface PayuCheckout {
  action: string;
  fields: Record<string, string>;
}

// PayU rejects names/phones with punctuation or odd lengths.
const cleanName = (n: string) => n.replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Customer";
const cleanPhone = (p: string) => p.replace(/\D/g, "").slice(-10);

// The order the gateway callbacks come back to. `next` (a same-site path) is
// where the browser lands afterwards — payu-return validates it.
export function payuCallbackUrl(origin: string, returnUrl: string): string {
  const u = new URL(returnUrl, origin);
  return `${origin}/api/payments/payu-return?next=${encodeURIComponent(u.pathname + u.search)}`;
}

// Builds the signed checkout for one order. `customerId` travels in udf1 so
// the signed callback can name the payer (used for orphaned fee payments).
export function createPayuOrder({
  orderId,
  amount,
  customerId,
  customerName,
  customerPhone,
  customerEmail,
  returnUrl,
  notifyUrl: _notifyUrl,
}: {
  orderId: string;
  amount: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  returnUrl: string; // absolute URL the browser should end up on
  notifyUrl?: string; // unused: PayU's webhook is registered once in its dashboard
}): { checkout: PayuCheckout } {
  const { key, salt } = credentials();
  const origin = new URL(returnUrl).origin;
  const amt = amount.toFixed(2);
  const productinfo = "DocOnClick";
  const firstname = cleanName(customerName);
  // PayU requires an email; patients who signed up with a mobile only have none.
  const email = customerEmail?.trim() || `${cleanPhone(customerPhone) || "user"}@noemail.doconclick.co.in`;
  const udf = [customerId, "", "", "", ""];
  const hash = sha512([key, orderId, amt, productinfo, firstname, email, ...udf, "", "", "", "", "", salt].join("|"));
  const cb = payuCallbackUrl(origin, returnUrl);
  return {
    checkout: {
      action: PAYU_CHECKOUT_URL(),
      fields: {
        key,
        txnid: orderId,
        amount: amt,
        productinfo,
        firstname,
        email,
        phone: cleanPhone(customerPhone),
        surl: cb,
        furl: cb,
        udf1: customerId,
        hash,
      },
    },
  };
}

// The successful payment on an order, if any — for the return page's
// verify-order fallback when the callback is lost. (`cfPaymentId` is the
// historical name; it holds PayU's mihpayid.)
export async function fetchSuccessfulPayment(
  orderId: string
): Promise<{ cfPaymentId: string; amount: number } | null> {
  const { key, salt } = credentials();
  const command = "verify_payment";
  const res = await fetch(`${PAYU_INFO_BASE()}/merchant/postservice?form=2`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ key, command, var1: orderId, hash: sha512(`${key}|${command}|${orderId}|${salt}`) }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || typeof data !== "object") {
    console.error("PayU verify_payment failed:", res.status, data);
    throw new Error("Could not check payment status");
  }
  const details = (data as { transaction_details?: Record<string, { status?: string; mihpayid?: string | number; amt?: string; transaction_amount?: string }> }).transaction_details;
  const txn = details?.[orderId];
  if (!txn || txn.status !== "success" || txn.mihpayid == null) return null;
  return { cfPaymentId: String(txn.mihpayid), amount: Number(txn.transaction_amount ?? txn.amt) };
}

// What a verified PayU callback/webhook tells us, normalised.
export interface PayuEvent {
  status: "success" | "failure" | "other";
  orderId: string;
  amount: number;
  paymentId: string; // mihpayid
  customerId: string | null; // udf1
}

// PayU signs the response with the reverse hash:
//   [additionalCharges|]salt|status||||||udf5..udf1|email|firstname|productinfo|amount|txnid|key
// computed over the exact strings it sent. Returns null if the hash is absent
// or wrong — never act on an unverified callback.
export function parsePayuEvent(form: URLSearchParams | FormData): PayuEvent | null {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const { key, salt } = credentials();
  const hash = get("hash");
  if (!hash || get("key") !== key) return null;
  const parts = [
    salt, get("status"), "", "", "", "", "",
    get("udf5"), get("udf4"), get("udf3"), get("udf2"), get("udf1"),
    get("email"), get("firstname"), get("productinfo"), get("amount"), get("txnid"), key,
  ];
  const extra = get("additionalCharges");
  const expected = sha512((extra ? [extra, ...parts] : parts).join("|"));
  const a = Buffer.from(expected);
  const b = Buffer.from(hash.toLowerCase());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const status = get("status").toLowerCase();
  return {
    status: status === "success" ? "success" : status === "failure" ? "failure" : "other",
    orderId: get("txnid"),
    amount: Number(get("amount")),
    paymentId: get("mihpayid"),
    customerId: get("udf1") || null,
  };
}

// Test helper: sign a response the way PayU does (used by tests/*.ts).
export function signPayuResponse(fields: Record<string, string>): string {
  const { key, salt } = credentials();
  const g = (k: string) => fields[k] ?? "";
  return sha512([
    salt, g("status"), "", "", "", "", "",
    g("udf5"), g("udf4"), g("udf3"), g("udf2"), g("udf1"),
    g("email"), g("firstname"), g("productinfo"), g("amount"), g("txnid"), key,
  ].join("|"));
}
