import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { signToken, type JWTPayload } from "@/lib/auth";

// Mobile equivalent of the web's /api/auth/google/start + /callback redirect
// dance: the Flutter app runs native Google Sign-In itself and just hands us
// the resulting Google ID token to verify, mirroring the same
// lookup-or-create logic as the web callback (src/app/api/auth/google/callback/route.ts).
const client = new OAuth2Client();

const AUDIENCES = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID_ANDROID,
  process.env.GOOGLE_CLIENT_ID_IOS,
].filter((v): v is string => Boolean(v));

export async function POST(req: Request) {
  try {
    const { idToken, intent, role } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: "idToken is required." }, { status: 400 });
    }
    if (AUDIENCES.length === 0) {
      return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 500 });
    }

    const ticket = await client.verifyIdToken({ idToken, audience: AUDIENCES });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      return NextResponse.json({ error: "google_no_email" }, { status: 400 });
    }

    let user = await prisma.user.findUnique({ where: { email: payload.email } });

    if (!user && intent === "reset") {
      return NextResponse.json({ error: "google_no_account" }, { status: 404 });
    }

    if (!user) {
      const desiredRole = role === "DOCTOR" ? "DOCTOR" : "PATIENT";
      user = await prisma.user.create({
        data: {
          name: payload.name || payload.email.split("@")[0],
          email: payload.email,
          mobile: `pending_${randomUUID()}`,
          password: "",
          role: desiredRole,
          ...(desiredRole === "DOCTOR"
            ? { doctorProfile: { create: { status: "PENDING" } } }
            : { patientProfile: { create: { age: 0, gender: "" } } }),
        },
      });
    }

    const jwtPayload: JWTPayload = { id: user.id, name: user.name, role: user.role, mobile: user.mobile };
    const token = signToken(jwtPayload);

    return NextResponse.json({
      token,
      user: jwtPayload,
      needsMobileNumber: user.mobile.startsWith("pending_"),
    });
  } catch (err) {
    console.error("Mobile Google sign-in error:", err);
    return NextResponse.json({ error: "google_failed" }, { status: 500 });
  }
}
