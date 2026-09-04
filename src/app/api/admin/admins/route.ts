import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { hashPassword } from "@/lib/auth";
import { validateRegistration } from "@/lib/validation";

// GET: all admin accounts, newest first
export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", deletedAt: null },
    select: { id: true, name: true, mobile: true, email: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(admins);
}

// POST: create a new admin account
export async function POST(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const parsed = validateRegistration(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { name, mobile, email, password } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ mobile }, ...(email ? [{ email }] : [])] },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this mobile number or email already exists." },
      { status: 409 }
    );
  }

  const admin = await prisma.user.create({
    data: {
      name,
      mobile,
      email,
      password: await hashPassword(password),
      role: "ADMIN",
    },
    select: { id: true, name: true, mobile: true, email: true, createdAt: true },
  });

  return NextResponse.json(admin);
}
