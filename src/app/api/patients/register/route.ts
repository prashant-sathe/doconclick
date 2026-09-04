import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { validateRegistration } from "@/lib/validation";

const GENDERS = ["Male", "Female", "Other"];

// POST: Register a new patient
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { age, gender, location } = body;

  const result = validateRegistration(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { name, mobile, email, password } = result.data;

  const ageNum = Number(age);
  if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
    return NextResponse.json({ error: "Enter a valid date of birth." }, { status: 400 });
  }
  if (!GENDERS.includes(String(gender))) {
    return NextResponse.json({ error: "Select a gender." }, { status: 400 });
  }

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

    // No `include` — the response only needs id/name/role.
    const user = await prisma.user.create({
      data: {
        name,
        mobile,
        email,
        password: hashed,
        role: "PATIENT",
        patientProfile: {
          create: { age: ageNum, gender: String(gender), location: location || null },
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
