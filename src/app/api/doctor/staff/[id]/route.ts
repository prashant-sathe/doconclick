import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword, revokeSessions } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH, nameError } from "@/lib/validation";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { deleteAccount } from "@/lib/userDeletion";
import { withErrorLocale } from "@/lib/apiErrors";

// `id` here is the staff User's id (not the StaffProfile id) — matches what
// GET /api/doctor/staff already hands the UI as `userId`.

/** The doctor's own, not-deleted staff member — or a 404 to send back. */
async function ownStaff(doctorId: string, userId: string) {
  const staffProfile = await prisma.staffProfile.findUnique({
    where: { userId },
    include: { user: { select: { deletedAt: true } } },
  });
  if (!staffProfile || staffProfile.doctorId !== doctorId || staffProfile.user.deletedAt) {
    return { response: NextResponse.json({ error: "Staff account not found" }, { status: 404 }) };
  }
  return { staffProfile };
}

// PATCH: rename, revoke/reactivate, or reset the password of a staff account.
export const PATCH = withErrorLocale(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const own = await ownStaff(authUser.id, id);
  if (own.response) return own.response;
  const { staffProfile } = own;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const { active, password, name } = body as { active?: unknown; password?: unknown; name?: unknown };
  if (active === undefined && password === undefined && name === undefined) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  // Revoking a receptionist's access (or just correcting their name) is
  // always allowed — an expired doctor must be able to lock out staff.
  // Reactivating or resetting a password is giving access back, which needs
  // an active plan.
  const givesAccess = password !== undefined || active === true;
  const denied = await requireActiveDoctor(authUser, { requireSubscription: givesAccess });
  if (denied) return denied;

  if (active !== undefined && typeof active !== "boolean") {
    return NextResponse.json({ error: "active must be true or false." }, { status: 400 });
  }
  if (password !== undefined && (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH)) {
    return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` }, { status: 400 });
  }
  let cleanName: string | undefined;
  if (name !== undefined) {
    const problem = typeof name === "string" ? nameError(name) : "Please enter the staff member's name.";
    if (problem) return NextResponse.json({ error: problem.replace("your full name", "their full name") }, { status: 400 });
    cleanName = (name as string).trim().replace(/\s+/g, " ");
  }

  if (password !== undefined || cleanName !== undefined) {
    await prisma.user.update({
      where: { id },
      data: {
        ...(password !== undefined ? { password: await hashPassword(password as string) } : {}),
        ...(cleanName !== undefined ? { name: cleanName } : {}),
      },
    });
  }

  const updated = active === undefined
    ? staffProfile
    : await prisma.staffProfile.update({ where: { userId: id }, data: { active } });

  // A password reset or a revoke signs the staff member out of every device;
  // a rename shows up on their next session refresh.
  if (password !== undefined || (active !== undefined && !updated.active)) await revokeSessions(id);

  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { name: true, mobile: true } });
  return NextResponse.json({ staffProfileId: updated.id, userId: id, name: user.name, mobile: user.mobile, active: updated.active });
});

// DELETE: remove a staff account for good. Same path as any account deletion
// (src/lib/userDeletion.ts): signed out everywhere, mobile/password cleared so
// the number can be registered again; messages they sent stay in the chats
// under their name. Allowed without an active plan — it only removes access.
export const DELETE = withErrorLocale(async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const denied = await requireActiveDoctor(authUser);
  if (denied) return denied;

  const { id } = await params;
  const own = await ownStaff(authUser.id, id);
  if (own.response) return own.response;

  await prisma.staffProfile.update({ where: { userId: id }, data: { active: false } });
  const result = await deleteAccount(id, "STAFF");
  if (!result) return NextResponse.json({ error: "Staff account not found" }, { status: 404 });
  return NextResponse.json({ deleted: true, userId: id });
});
