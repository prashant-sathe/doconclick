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

    return NextResponse.json({ id: user.id, name: user.name, role: user.role });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
