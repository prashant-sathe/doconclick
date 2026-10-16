import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, COOKIE_SECURE, IMPERSONATOR_COOKIE_NAME, type JWTPayload } from "@/lib/auth";
import { validateQuickRegistration } from "@/lib/validation";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// POST: Register a new patient with just mobile + password, and sign them
// in. Name, age and gender are collected at the first booking (see
// src/lib/bookingProfile.ts) — the profile starts with the same "not filled"
// placeholders Google signup uses.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const result = validateQuickRegistration(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { mobile, password } = result.data;

  try {
    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (existing) {
      return NextResponse.json({ error: "This mobile number is already registered. Try signing in instead." }, { status: 409 });
    }

    const hashed = await hashPassword(password);

    // No `include` — the response only needs id/name/role.
    const user = await prisma.user.create({
      data: {
        name: "",
        mobile,
        password: hashed,
        role: "PATIENT",
        patientProfile: { create: { age: 0, gender: "" } },
      },
    });

    const payload: JWTPayload = { id: user.id, name: user.name, role: user.role, mobile: user.mobile };
    const response = NextResponse.json({ id: user.id, name: user.name, role: user.role });
    response.cookies.set(COOKIE_NAME, signToken(payload), {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    // Same as login: a new session never inherits a leftover impersonation stash.
    response.cookies.set(IMPERSONATOR_COOKIE_NAME, "", {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "This mobile number is already registered. Try signing in instead." }, { status: 409 });
    }
    console.error("Patient registration failed:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
