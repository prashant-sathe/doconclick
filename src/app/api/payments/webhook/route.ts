import { NextResponse } from "next/server";
import { parsePayuEvent } from "@/lib/payu";
import { processPaymentEvent, toPaymentEventPayload } from "@/lib/paymentEvents";
import { withErrorLocale } from "@/lib/apiErrors";

// POST: PayU's server-to-server webhook (enable it in the PayU dashboard →
// Webhooks → "Successful / Failed payments", URL = this route). Form-encoded.
// No session auth — trust comes entirely from the response hash, verified
// before anything is read from the body.
export const POST = withErrorLocale(async function POST(req: Request) {
  const form = new URLSearchParams(await req.text());
  const event = parsePayuEvent(form);
  if (!event) {
    console.error("PayU webhook hash verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const payload = toPaymentEventPayload(event);
  if (payload) await processPaymentEvent(payload);
  return NextResponse.json({ ok: true });
});
