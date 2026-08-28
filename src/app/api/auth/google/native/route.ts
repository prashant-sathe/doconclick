import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { setAuthCookie } from "@/lib/auth";
import { resolveGoogleUser } from "@/lib/googleAuth";
import type { OAuthRole, OAuthIntent } from "@/lib/googleOAuth";

// Native Google Sign-In (@capgo/capacitor-social-login) runs the OS account
// picker inside the app and hands back an OpenID Connect ID token — no browser,
// no deep link. This endpoint is called from inside the WebView, so the
// Set-Cookie below lands in the app's own cookie jar. The token's signature,
// issuer, audience and expiry are all verified here before it's trusted.
//
// Accepted audiences: the plugin is configured with the Web client as
// serverClientId, so tokens normally carry GOOGLE_CLIENT_ID as `aud` — but a
// build that sends its own-audience token is accepted too.
const AUDIENCES = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID_ANDROID,
  process.env.GOOGLE_CLIENT_ID_IOS,
].filter((v): v is string => !!v);

const client = new OAuth2Client();

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const idToken = body?.idToken;
  const role: OAuthRole = body?.role === "DOCTOR" ? "DOCTOR" : "PATIENT";
  const intent: OAuthIntent = body?.intent === "reset" ? "reset" : "login";
  const next = typeof body?.next === "string" ? body.next : undefined;

  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  if (AUDIENCES.length === 0) {
    console.error("Native Google sign-in: GOOGLE_CLIENT_ID is not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: AUDIENCES });
    payload = ticket.getPayload();
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  if (!payload?.email || !payload.email_verified) {
    return NextResponse.json({ error: "google_no_email" }, { status: 400 });
  }

  const resolved = await resolveGoogleUser({
    email: payload.email,
    name: payload.name,
    role,
    intent,
    next,
  });

  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  await setAuthCookie(resolved.payload);
  return NextResponse.json({ next: resolved.destination });
}
