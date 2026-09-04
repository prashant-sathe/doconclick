import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// GET: the logged-in admin's own record (includes photoUrl, which isn't
// carried in the auth cookie).
export async function GET() {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const admin = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { id: true, name: true, mobile: true, email: true, photoUrl: true },
  });
  return NextResponse.json(admin);
}
