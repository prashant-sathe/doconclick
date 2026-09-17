import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword } from "@/lib/auth";
import { validateRegistration } from "@/lib/validation";

// GET: the logged-in doctor's own staff/receptionist accounts
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const staff = await prisma.staffProfile.findMany({
    where: { doctorId: authUser.id },
    include: { user: { select: { id: true, name: true, mobile: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    staff.map((s) => ({
      staffProfileId: s.id,
      userId: s.user.id,
      name: s.user.name,
      mobile: s.user.mobile,
      active: s.active,
      createdAt: s.createdAt,
    }))
  );
}

// POST: doctor creates a new staff/receptionist account, scoped to their own
// appointment queue only. The doctor sets the initial password directly and
// shares it with the staff member — there's no SMS/email delivery in this
// codebase to build an invite-link flow on top of.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = validateRegistration(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { name, mobile, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { mobile } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this mobile number already exists." },
      { status: 409 }
    );
  }

  const created = await prisma.user.create({
    data: {
      name,
      mobile,
      password: await hashPassword(password),
      role: "STAFF",
      staffAccount: { create: { doctorId: authUser.id } },
    },
    select: { id: true, name: true, mobile: true, staffAccount: { select: { id: true, active: true, createdAt: true } } },
  });

  return NextResponse.json({
    staffProfileId: created.staffAccount!.id,
    userId: created.id,
    name: created.name,
    mobile: created.mobile,
    active: created.staffAccount!.active,
    createdAt: created.staffAccount!.createdAt,
  });
}
