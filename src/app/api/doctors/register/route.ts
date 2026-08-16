import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, COOKIE_SECURE, type JWTPayload } from "@/lib/auth";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function POST(req: Request) {
  const body = await req.json();
  const { name, mobile, email, password } = body;

  if (!name || !mobile || !password) {
    return NextResponse.json({ error: "All required fields must be filled." }, { status: 400 });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (existing) {
      return NextResponse.json({ error: "This mobile number is already registered." }, { status: 409 });
    }

    const hashed = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        mobile,
        email: email || null,
        password: hashed,
        role: "DOCTOR",
        doctorProfile: {
          create: { status: "PENDING" },
        },
      },
      include: { doctorProfile: true },
    });

    const payload: JWTPayload = { id: user.id, name: user.name, role: user.role, mobile: user.mobile };
    const token = signToken(payload);

    const response = NextResponse.json({ id: user.id, name: user.name, role: user.role });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
