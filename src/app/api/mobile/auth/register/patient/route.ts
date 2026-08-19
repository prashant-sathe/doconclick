import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, type JWTPayload } from "@/lib/auth";

// Mobile-app equivalent of /api/patients/register — same validation/create
// logic, but signs and returns a token immediately so the app can go
// straight to a logged-in state instead of requiring a separate login call.
export async function POST(req: Request) {
  const body = await req.json();
  const { name, mobile, email, age, gender, location, password } = body;

  if (!name || !mobile || !password || !age || !gender) {
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
        role: "PATIENT",
        patientProfile: {
          create: { age: Number(age), gender, location: location || null },
        },
      },
      include: { patientProfile: true },
    });

    const payload: JWTPayload = { id: user.id, name: user.name, role: user.role, mobile: user.mobile };
    const token = signToken(payload);

    return NextResponse.json({ token, user: payload });
  } catch (err) {
    console.error("Mobile patient register error:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
