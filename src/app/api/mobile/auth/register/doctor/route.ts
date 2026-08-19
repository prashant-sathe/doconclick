import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, type JWTPayload } from "@/lib/auth";

// Mobile-app equivalent of /api/doctors/register — same validation/create
// logic, but signs and returns a token immediately instead of a cookie.
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

    return NextResponse.json({ token, user: payload });
  } catch (err) {
    console.error("Mobile doctor register error:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
