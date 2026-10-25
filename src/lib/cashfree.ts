import crypto from "crypto";

// The registration fee is admin-set (PlatformSettings.doctorRegistrationFee =
// the discounted price charged, doctorRegistrationOriginalFee = the original;
// resolved in src/lib/doctorFees.ts); this is only the discount's default. The subscription
// fee is shared with the webhook's amount-match check — keep in one place.
export const DEFAULT_DOCTOR_REGISTRATION_FEE = 99;
export const DOCTOR_SUBSCRIPTION_FEE = 499;

// CASHFREE_API_BASE points at a local mock in tests (tests/payment-orders.ts)
// so they never reach the real gateway. Never set it in production.
const CASHFREE_BASE =
  process.env.CASHFREE_API_BASE ??
  (process.env.CASHFREE_ENV === "sandbox"
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg");

const CASHFREE_API_VERSION = "2026-01-01";

function cashfreeHeaders() {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secretKey) {
    throw new Error("Cashfree is not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY missing)");
  }
  return {
    "x-client-id": appId,
    "x-client-secret": secretKey,
    "x-api-version": CASHFREE_API_VERSION,
    "Content-Type": "application/json",
  };
}

export async function createCashfreeOrder({
  orderId,
  amount,
  customerId,
  customerName,
  customerPhone,
  customerEmail,
  returnUrl,
  notifyUrl,
}: {
  orderId: string;
  amount: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  returnUrl: string;
  notifyUrl: string;
}): Promise<{ paymentSessionId: string; cfOrderId: string }> {
  const res = await fetch(`${CASHFREE_BASE}/orders`, {
    method: "POST",
    headers: cashfreeHeaders(),
    body: JSON.stringify({
      order_id: orderId,
      order_amount: amount,
      order_currency: "INR",
      customer_details: {
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        ...(customerEmail ? { customer_email: customerEmail } : {}),
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: notifyUrl,
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.payment_session_id) {
    console.error("Cashfree create-order failed:", res.status, data);
    throw new Error(data?.message ?? "Could not create payment order");
  }

  return { paymentSessionId: data.payment_session_id, cfOrderId: data.cf_order_id };
}

// The successful payment on an order, if any — for the return page's
// verify-order fallback when the webhook is late or never arrives.
export async function fetchSuccessfulPayment(
  orderId: string
): Promise<{ cfPaymentId: string; amount: number } | null> {
  const res = await fetch(`${CASHFREE_BASE}/orders/${encodeURIComponent(orderId)}/payments`, {
    headers: cashfreeHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data)) {
    console.error("Cashfree get-payments failed:", res.status, data);
    throw new Error("Could not check payment status");
  }
  const paid = data.find((p: { payment_status?: string }) => p.payment_status === "SUCCESS");
  return paid ? { cfPaymentId: String(paid.cf_payment_id), amount: Number(paid.payment_amount) } : null;
}

// Cashfree signs `timestamp + rawBody` with HMAC-SHA256 (base64-encoded) using
// the secret key. Must be computed against the raw request body — re-parsing
// and re-serializing JSON can shift decimal precision on amounts and break
// verification (per Cashfree's own docs).
export function verifyCashfreeWebhookSignature(rawBody: string, timestamp: string, signature: string): boolean {
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!secretKey) return false;

  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(timestamp + rawBody)
    .digest("base64");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
