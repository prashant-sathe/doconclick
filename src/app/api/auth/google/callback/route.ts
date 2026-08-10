import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { signToken, COOKIE_SECURE, type JWTPayload } from "@/lib/auth";
import { STATE_COOKIE_NAME, decodeState } from "@/lib/googleOAuth";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  DOCTOR: "/doctor/dashboard",
  PATIENT: "/patient/dashboard",
};

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
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");

  if (!code || !rawState) {
    return failureRedirect(url.origin, "google_failed");
  }

  const state = decodeState(rawState);
  const cookieStore = await cookies();
  const expectedNonce = cookieStore.get(STATE_COOKIE_NAME)?.value;

  if (!state || !expectedNonce || state.nonce !== expectedNonce) {
    return failureRedirect(url.origin, "google_state_mismatch");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return failureRedirect(url.origin, "google_failed");
    }

    const { access_token: accessToken } = await tokenRes.json();

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      return failureRedirect(url.origin, "google_failed");
    }

    const googleUser: GoogleUserInfo = await userInfoRes.json();
    if (!googleUser.email) {
      return failureRedirect(url.origin, "google_no_email");
    }

    let user = await prisma.user.findUnique({ where: { email: googleUser.email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: googleUser.name || googleUser.email.split("@")[0],
          email: googleUser.email,
          mobile: `pending_${randomUUID()}`,
          password: "",
          role: state.role,
          ...(state.role === "DOCTOR"
            ? { doctorProfile: { create: { status: "PENDING" } } }
            : { patientProfile: { create: { age: 0, gender: "" } } }),
        },
      });
    }

    const payload: JWTPayload = {
      id: user.id,
      name: user.name,
      role: user.role,
      mobile: user.mobile,
    };
    const token = signToken(payload);

    const destination = user.mobile.startsWith("pending_")
      ? "/complete-profile"
      : state.next || ROLE_HOME[user.role] || "/";

    const response = NextResponse.redirect(new URL(destination, url.origin));
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
    return failureRedirect(url.origin, "google_failed");
  }
}
