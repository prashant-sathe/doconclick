import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { softDeleteUser } from "@/lib/userDeletion";

// DELETE: remove an admin account. Blocked for the caller's own account and
// for the last remaining admin, so the panel can never lock everyone out.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (id === authUser.id) {
    return NextResponse.json({ error: "You can't remove your own admin account." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.role !== "ADMIN" || target.deletedAt) {
    return NextResponse.json({ error: "Admin not found." }, { status: 404 });
  }

  const adminCount = await prisma.user.count({ where: { role: "ADMIN", deletedAt: null } });
  if (adminCount <= 1) {
    return NextResponse.json({ error: "Can't remove the last remaining admin." }, { status: 400 });
  }

  const deleted = await softDeleteUser(id);
  return NextResponse.json({ ...deleted, password: undefined });
}
