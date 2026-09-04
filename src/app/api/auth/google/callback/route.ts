import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signToken, COOKIE_SECURE } from "@/lib/auth";
import { STATE_COOKIE_NAME, decodeState, oauthCanonicalOrigin } from "@/lib/googleOAuth";
import { resolveGoogleUser } from "@/lib/googleAuth";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

type GoogleUserInfo = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  sub?: string;
};

function failureRedirect(origin: string, reason: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
  response.cookies.set(STATE_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return response;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Must be the exact origin /start used for `redirect_uri`, or the token
  // exchange fails with redirect_uri_mismatch.
  const origin = oauthCanonicalOrigin(req, url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");

  if (!code || !rawState) {
    return failureRedirect(origin, "google_failed");
  }

  const state = decodeState(rawState);
  const cookieStore = await cookies();
  const expectedNonce = cookieStore.get(STATE_COOKIE_NAME)?.value;

  if (!state || !expectedNonce || state.nonce !== expectedNonce) {
    return failureRedirect(origin, "google_state_mismatch");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return failureRedirect(origin, "google_failed");
    }

    const { access_token: accessToken } = await tokenRes.json();

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      return failureRedirect(origin, "google_failed");
    }

    const googleUser: GoogleUserInfo = await userInfoRes.json();
    if (!googleUser.email) {
      return failureRedirect(origin, "google_no_email");
    }

    const resolved = await resolveGoogleUser({
      email: googleUser.email,
      name: googleUser.name,
      role: state.role,
      intent: state.intent,
      next: state.next,
    });

    if ("error" in resolved) {
      return failureRedirect(origin, resolved.error);
    }

    const token = signToken(resolved.payload);
    const response = NextResponse.redirect(new URL(resolved.destination, origin));
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    response.cookies.set(STATE_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return failureRedirect(origin, "google_failed");
  }
}
