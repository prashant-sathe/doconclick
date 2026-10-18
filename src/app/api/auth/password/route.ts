import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  getAuthUser,
  hashPassword,
  verifyPassword,
  verifyPasswordResetToken,
  revokeSessions,
  signToken,
  sessionPayload,
  COOKIE_SECURE,
  PWRESET_COOKIE_NAME,
} from "@/lib/auth";
import { createRateLimiter } from "@/lib/rateLimit";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// Caps guesses at the current password by someone holding a session.
const checkAttemptLimit = createRateLimiter(5, 15 * 60 * 1000);

// PATCH { currentPassword, password }: change the logged-in user's password.
// A session alone isn't enough — it must come with either the current
// password or the short-lived proof the forgot-password flow sets after
// re-verifying via Google (also the only way for a Google-only account, which
// has no password yet, to set one). Every other session is then revoked.
export async function PATCH(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { currentPassword, password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const resetToken = cookieStore.get(PWRESET_COOKIE_NAME)?.value;
  const viaReset = !!resetToken && (await verifyPasswordResetToken(resetToken, user.id));

  if (!viaReset) {
    if (!user.password) {
      return NextResponse.json(
        { error: "Verify with Google to set a password for this account.", code: "REVERIFY_REQUIRED" },
        { status: 403 }
      );
    }
    if (typeof currentPassword !== "string" || !currentPassword) {
      return NextResponse.json({ error: "Enter your current password.", code: "CURRENT_PASSWORD_REQUIRED" }, { status: 400 });
    }
    if (!checkAttemptLimit(user.id)) {
      return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
    }
    if (!(await verifyPassword(currentPassword, user.password))) {
      return NextResponse.json({ error: "Current password is incorrect.", code: "WRONG_PASSWORD" }, { status: 400 });
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await hashPassword(password) },
  });
  // Signs out every other device; this one gets a fresh cookie below.
  const tokenVersion = await revokeSessions(user.id);

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, signToken(sessionPayload({ ...user, tokenVersion })), {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  response.cookies.set(PWRESET_COOKIE_NAME, "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", maxAge: 0, path: "/" });
  return response;
}
