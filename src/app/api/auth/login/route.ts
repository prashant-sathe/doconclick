import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, sessionPayload, COOKIE_SECURE, IMPERSONATOR_COOKIE_NAME } from "@/lib/auth";
import { normalizeMobile, MOBILE_REGEX } from "@/lib/validation";
import { createRateLimiter, createFailureLimiter, clientIp } from "@/lib/rateLimit";
import { withErrorLocale } from "@/lib/apiErrors";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

const LOCKOUT_MESSAGE = "Too many sign-in attempts. Please wait 15 minutes and try again.";
// Per mobile: wrong passwords only, cleared on success — stops guessing one
// account's password. Per IP: every attempt — stops one client spraying
// passwords across many accounts.
const mobileFailures = createFailureLimiter(5, 15 * 60 * 1000);
const checkIpLimit = createRateLimiter(30, 15 * 60 * 1000);

export const POST = withErrorLocale(async function POST(req: Request) {
  if (!checkIpLimit(clientIp(req))) {
    return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
  }
  try {
    const { mobile, password } = await req.json().catch(() => ({}));

    if (!mobile || !password) {
      return NextResponse.json(
        { error: "Mobile number and password are required." },
        { status: 400 }
      );
    }

    const normalizedMobile = normalizeMobile(String(mobile));
    if (!MOBILE_REGEX.test(normalizedMobile)) {
      return NextResponse.json(
        { error: "Enter a valid 10-digit mobile number." },
        { status: 400 }
      );
    }

    if (mobileFailures.isBlocked(normalizedMobile)) {
      return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { mobile: normalizedMobile } });

    if (!user || !user.password) {
      // Counted like a wrong password, so the response doesn't reveal
      // which mobiles have accounts.
      mobileFailures.recordFailure(normalizedMobile);
      return NextResponse.json(
        { error: "Invalid mobile number or password." },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      mobileFailures.recordFailure(normalizedMobile);
      return NextResponse.json(
        { error: "Invalid mobile number or password." },
        { status: 401 }
      );
    }

    mobileFailures.reset(normalizedMobile);
    const token = signToken(sessionPayload(user));

    // Set cookie directly on the response — required for Route Handlers in Next.js 15+
    const response = NextResponse.json({
      id: user.id,
      name: user.name,
      role: user.role,
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    // A fresh login should never inherit a leftover impersonation stash from
    // a previous session that didn't exit cleanly.
    response.cookies.set(IMPERSONATOR_COOKIE_NAME, "", {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
});
