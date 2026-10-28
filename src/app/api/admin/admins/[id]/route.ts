import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, lastAdminGuard } from "@/lib/adminAuth";
import { deleteAccount } from "@/lib/userDeletion";

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

  const result = await deleteAccount(id, "ADMIN", { guard: lastAdminGuard() });

  if (!result) return NextResponse.json({ error: "Admin not found." }, { status: 404 });
  if ("refused" in result) {
    const { error, status } = result.refused!;
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ ...result.user, password: undefined });
}
