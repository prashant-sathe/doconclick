import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

// PATCH: Toggle active state and/or change color
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { isActive, color } = await req.json();

  const specialty = await prisma.specialty.update({
    where: { id },
    data: {
      ...(typeof isActive === "boolean" ? { isActive } : {}),
      ...(color ? { color } : {}),
    },
  });
  return NextResponse.json(specialty);
}

// DELETE: Remove a specialty — blocked if any doctor currently has it selected
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const specialty = await prisma.specialty.findUnique({ where: { id } });
  if (!specialty) {
    return NextResponse.json({ error: "Specialty not found" }, { status: 404 });
  }

  const inUseCount = await prisma.doctorProfile.count({ where: { specialty: specialty.name } });
  if (inUseCount > 0) {
    return NextResponse.json(
      { error: `In use by ${inUseCount} doctor${inUseCount === 1 ? "" : "s"} — deactivate instead of deleting.` },
      { status: 409 }
    );
  }

  await prisma.specialty.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
