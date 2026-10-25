import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { requireRole } from "@/lib/routeGuards";
import { withErrorLocale } from "@/lib/apiErrors";

// DELETE: remove one of the signed-in doctor's own favourite medicines.
export const DELETE = withErrorLocale(async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return denied;
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const { count } = await prisma.doctorFavouriteMedicine.deleteMany({ where: { id, doctorId: authUser.id } });
  if (count === 0) return NextResponse.json({ error: "Favourite not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
