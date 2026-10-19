import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword, revokeSessions } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { requireActiveDoctor } from "@/lib/doctorGuard";

// PATCH: revoke/reactivate a staff account, or reset its password.
// `id` here is the staff User's id (not the StaffProfile id) — matches what
// GET /api/doctor/staff already hands the UI as `userId`.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const staffProfile = await prisma.staffProfile.findUnique({ where: { userId: id } });
  if (!staffProfile || staffProfile.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Staff account not found" }, { status: 404 });
  }

  const { active, password } = await req.json().catch(() => ({}));
  // Revoking a receptionist's access is always allowed — an expired doctor
  // must be able to lock out staff. Reactivating or resetting a password is
  // giving access back, which needs an active plan.
  const revokeOnly = password === undefined && active !== undefined && !active;
  const denied = await requireActiveDoctor(authUser, { requireSubscription: !revokeOnly });
  if (denied) return denied;

  if (password !== undefined) {
    if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
      return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` }, { status: 400 });
    }
    await prisma.user.update({ where: { id }, data: { password: await hashPassword(password) } });
  }

  const updated = active === undefined
    ? staffProfile
    : await prisma.staffProfile.update({ where: { userId: id }, data: { active: Boolean(active) } });

  // A password reset or a revoke signs the staff member out of every device.
  if (password !== undefined || (active !== undefined && !updated.active)) await revokeSessions(id);

  return NextResponse.json({ staffProfileId: updated.id, userId: id, active: updated.active });
}
