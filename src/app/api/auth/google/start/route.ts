import { NextResponse } from "next/server";
import { COOKIE_SECURE } from "@/lib/auth";
import {
  STATE_COOKIE_NAME,
  STATE_COOKIE_MAX_AGE,
  encodeState,
  newNonce,
  externalOrigin,
  oauthCanonicalOrigin,
  type OAuthRole,
  type OAuthIntent,
} from "@/lib/googleOAuth";

// GET: Kick off Google's OAuth consent flow for either role.
// ?role=PATIENT|DOCTOR (defaults to PATIENT), optional ?next=/some/path,
// optional ?intent=reset (defaults to "login") for the forgot-password flow.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const role: OAuthRole = url.searchParams.get("role") === "DOCTOR" ? "DOCTOR" : "PATIENT";
  const next = url.searchParams.get("next") ?? undefined;
  const intent: OAuthIntent = url.searchParams.get("intent") === "reset" ? "reset" : "login";

  // The whole flow — state cookie, redirect_uri, callback — must live on one
  // origin Google recognises. If the user landed here on a different host
  // (e.g. www. vs apex), bounce to the canonical one first, keeping the query.
  const canonicalOrigin = oauthCanonicalOrigin(req, url);
  if (canonicalOrigin !== externalOrigin(req, url)) {
    return NextResponse.redirect(`${canonicalOrigin}/api/auth/google/start${url.search}`);
  }

  const nonce = newNonce();
  const state = encodeState({ nonce, role, next, intent });
  const redirectUri = `${canonicalOrigin}/api/auth/google/callback`;

  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  googleUrl.searchParams.set("redirect_uri", redirectUri);
  googleUrl.searchParams.set("response_type", "code");
  googleUrl.searchParams.set("scope", "openid email profile");
  googleUrl.searchParams.set("state", state);
  googleUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(googleUrl.toString());
  response.cookies.set(STATE_COOKIE_NAME, nonce, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
