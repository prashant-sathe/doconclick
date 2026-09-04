import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

// POST: Register a new patient
export async function POST(req: Request) {
  const body = await req.json();
  const { name, mobile, email, age, gender, location, password } = body;

  if (!name || !mobile || !password || !age || !gender) {
    return NextResponse.json({ error: "All required fields must be filled." }, { status: 400 });
  }

  const normalizedEmail = typeof email === "string" && email.trim() ? email.trim() : null;

  try {
    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (existing) {
      return NextResponse.json({ error: "This mobile number is already registered. Try signing in instead." }, { status: 409 });
    }
    if (normalizedEmail) {
      const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existingEmail) {
        return NextResponse.json({ error: "This email is already registered. Try signing in instead." }, { status: 409 });
      }
    }

    const hashed = await hashPassword(password);

    // No `include` — the response only needs id/name/role.
    const user = await prisma.user.create({
      data: {
        name,
        mobile,
        email: normalizedEmail,
        password: hashed,
        role: "PATIENT",
        patientProfile: {
          create: { age: Number(age), gender, location: location || null },
        },
      },
    });

    return NextResponse.json({ id: user.id, name: user.name, role: user.role });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
      const field = Array.isArray(target) ? target.join(",") : String(target ?? "");
      const what = field.includes("email") ? "email" : field.includes("mobile") ? "mobile number" : "account";
      return NextResponse.json({ error: `This ${what} is already registered. Try signing in instead.` }, { status: 409 });
    }
    console.error("Patient registration failed:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
