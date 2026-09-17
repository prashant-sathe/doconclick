import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

// PATCH: revoke/reactivate a staff account, or reset its password.
// `id` here is the staff User's id (not the StaffProfile id) — matches what
// GET /api/doctor/staff already hands the UI as `userId`.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;
  const staffProfile = await prisma.staffProfile.findUnique({ where: { userId: id } });
  if (!staffProfile || staffProfile.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Staff account not found" }, { status: 404 });
  }

  const { active, password } = await req.json().catch(() => ({}));

  if (password !== undefined) {
    if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
      return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` }, { status: 400 });
    }
    await prisma.user.update({ where: { id }, data: { password: await hashPassword(password) } });
  }

  const updated = active === undefined
    ? staffProfile
    : await prisma.staffProfile.update({ where: { userId: id }, data: { active: Boolean(active) } });

  return NextResponse.json({ staffProfileId: updated.id, userId: id, active: updated.active });
}
