import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, COOKIE_SECURE, type JWTPayload } from "@/lib/auth";
import { sendPushToAdmins } from "@/lib/firebaseAdmin";
import { validateRegistration } from "@/lib/validation";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const result = validateRegistration(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { name, mobile, email, password } = result.data;

  try {
    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (existing) {
      return NextResponse.json({ error: "This mobile number is already registered. Try signing in instead." }, { status: 409 });
    }
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return NextResponse.json({ error: "This email is already registered. Try signing in instead." }, { status: 409 });
      }
    }

    const hashed = await hashPassword(password);

    // No `include` — the response only needs id/name/role, and reading the
    // freshly-created profile back adds a failure surface for no benefit.
    const user = await prisma.user.create({
      data: {
        name,
        mobile,
        email,
        password: hashed,
        role: "DOCTOR",
        doctorProfile: {
          create: { status: "PENDING" },
        },
      },
    });

    void sendPushToAdmins({
      title: "New doctor registration",
      body: `${name} registered and is awaiting verification.`,
      url: "/admin/doctors",
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
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
      const field = Array.isArray(target) ? target.join(",") : String(target ?? "");
      const what = field.includes("email") ? "email" : field.includes("mobile") ? "mobile number" : "account";
      return NextResponse.json({ error: `This ${what} is already registered. Try signing in instead.` }, { status: 409 });
    }
    console.error("Doctor registration failed:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
