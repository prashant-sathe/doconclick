import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, type JWTPayload } from "@/lib/auth";

// Mobile-app equivalent of /api/auth/login — same lookup/verify logic, but
// returns the JWT in the JSON body instead of setting a cookie, since the
// Flutter app has no cookie jar to persist it in.
export async function POST(req: Request) {
  try {
    const { mobile, password } = await req.json();

    if (!mobile || !password) {
      return NextResponse.json({ error: "Mobile number and password are required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { mobile } });
    if (!user || !user.password) {
      return NextResponse.json({ error: "Invalid mobile number or password." }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid mobile number or password." }, { status: 401 });
    }

    const payload: JWTPayload = { id: user.id, name: user.name, role: user.role, mobile: user.mobile };
    const token = signToken(payload);

    return NextResponse.json({ token, user: payload });
  } catch (err) {
    console.error("Mobile login error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
