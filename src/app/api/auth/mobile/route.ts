import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, signToken, COOKIE_SECURE, type JWTPayload } from "@/lib/auth";
import { normalizeMobile, MOBILE_REGEX } from "@/lib/validation";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// PATCH: One-time step for Google sign-ins — set a real mobile number in
// place of the "pending_..." placeholder created at account creation.
export async function PATCH(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { mobile } = await req.json().catch(() => ({ mobile: undefined }));
  const normalizedMobile = normalizeMobile(String(mobile ?? ""));
  if (!MOBILE_REGEX.test(normalizedMobile)) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: authUser.id },
      data: { mobile: normalizedMobile },
    });

    const payload: JWTPayload = {
      id: updated.id,
      name: updated.name,
      role: updated.role,
      mobile: updated.mobile,
    };
    const token = signToken(payload);

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
