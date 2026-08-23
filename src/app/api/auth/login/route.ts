import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, COOKIE_SECURE, IMPERSONATOR_COOKIE_NAME, type JWTPayload } from "@/lib/auth";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function POST(req: Request) {
  try {
    const { mobile, password } = await req.json();

    if (!mobile || !password) {
      return NextResponse.json(
        { error: "Mobile number and password are required." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { mobile } });

    if (!user || !user.password) {
      return NextResponse.json(
        { error: "Invalid mobile number or password." },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid mobile number or password." },
        { status: 401 }
      );
    }

    const payload: JWTPayload = {
      id: user.id,
      name: user.name,
      role: user.role,
      mobile: user.mobile,
    };

    const token = signToken(payload);

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
}
