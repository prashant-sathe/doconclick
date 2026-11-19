import { NextResponse } from "next/server";
import { parsePayuEvent } from "@/lib/payu";
import { processPaymentEvent, toPaymentEventPayload } from "@/lib/paymentEvents";
import { externalOrigin } from "@/lib/googleOAuth";

// PayU sends the customer's browser back here (surl/furl) with a form POST.
// A verified result is settled right away (the same idempotent path as the
// webhook, so the two can race), then the browser is sent on to the page that
// asked for the payment with a 303 — so the app's own return page (which also
// polls /verify-order) loads as a normal GET with the user's session cookie.
function landing(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "";
  // Same-site paths only: this is the one unauthenticated redirect we have.
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
  return new URL(safe, externalOrigin(req, url));
}

export async function POST(req: Request) {
  try {
    const event = parsePayuEvent(new URLSearchParams(await req.text()));
    const payload = event && toPaymentEventPayload(event);
    if (payload) await processPaymentEvent(payload);
    else if (!event) console.error("PayU return: hash verification failed — not settling");
  } catch (err) {
    // The return page's verify-order fallback still settles it.
    console.error("PayU return: settlement failed", err);
  }
  return NextResponse.redirect(landing(req), 303);
}

export async function GET(req: Request) {
  return NextResponse.redirect(landing(req), 303);
}
