import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, signToken, sessionPayload, COOKIE_SECURE } from "@/lib/auth";
import { normalizeMobile, MOBILE_REGEX } from "@/lib/validation";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// PATCH: One-time step for Google sign-ins — set a real mobile number in
// place of the "pending_..." placeholder created at account creation. Only
// that: the mobile number is the password-login identifier, so changing an
// already-set one without verifying the new number would be an account
// takeover path.
export async function PATCH(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The DB row, not the token — a stale token could still say pending_.
  const current = await prisma.user.findUnique({ where: { id: authUser.id }, select: { mobile: true } });
  if (!current?.mobile.startsWith("pending_")) {
    return NextResponse.json({ error: "Your mobile number is already set." }, { status: 403 });
  }

  const { mobile } = await req.json().catch(() => ({ mobile: undefined }));
  const normalizedMobile = normalizeMobile(String(mobile ?? ""));
  if (!MOBILE_REGEX.test(normalizedMobile)) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  try {
    // Conditional on still being pending_, so two racing requests can't both set it.
    const claimed = await prisma.user.updateMany({
      where: { id: authUser.id, mobile: { startsWith: "pending_" } },
      data: { mobile: normalizedMobile },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "Your mobile number is already set." }, { status: 403 });
    }
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });

    const token = signToken(sessionPayload(updated));

    const response = NextResponse.json({ id: updated.id, name: updated.name, role: updated.role });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "This mobile number is already registered." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not update your mobile number." }, { status: 500 });
  }
}
