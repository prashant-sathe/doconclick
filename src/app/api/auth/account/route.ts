import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAuthUser, verifyPassword, COOKIE_SECURE, IMPERSONATOR_COOKIE_NAME, PWRESET_COOKIE_NAME } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rateLimit";
import { accountDeletionPreview, deleteAccount, DeletionBlockedError, SELF_DELETABLE_ROLES } from "@/lib/userDeletion";

const COOKIE_NAME = "doconclick_token";

// Caps password guesses by someone holding a session, as on Change Password.
const checkAttemptLimit = createRateLimiter(5, 15 * 60 * 1000);

// GET: what deleting this account would do (open bookings to cancel, refunds,
// wallet balance left behind) — shown on the confirmation screen.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!SELF_DELETABLE_ROLES.includes(authUser.role)) {
    return NextResponse.json({ error: "This account can't be deleted from the app." }, { status: 403 });
  }
  return NextResponse.json(await accountDeletionPreview(authUser.id, authUser.role));
}

// DELETE { password }: the signed-in patient, doctor or nurse deletes their
// own account. A session alone isn't enough — the current password must come
// with it. Open bookings are cancelled and refunded, then the account is
// soft-deleted and anonymized (src/lib/userDeletion.ts).
export async function DELETE(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!SELF_DELETABLE_ROLES.includes(authUser.role)) {
    return NextResponse.json({ error: "This account can't be deleted from the app." }, { status: 403 });
  }
  // An impersonating admin would be deleting the *target's* account.
  if ((await cookies()).get(IMPERSONATOR_COOKIE_NAME)?.value) {
    return NextResponse.json({ error: "Not available while impersonating." }, { status: 400 });
  }

  const { password } = await req.json().catch(() => ({}));
  const user = await prisma.user.findUnique({ where: { id: authUser.id }, select: { password: true } });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.password) {
    return NextResponse.json(
      { error: "Set a password first (verify with Google), then delete your account.", code: "REVERIFY_REQUIRED" },
      { status: 403 }
    );
  }
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Enter your password.", code: "PASSWORD_REQUIRED" }, { status: 400 });
  }
  if (!checkAttemptLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }
  if (!(await verifyPassword(password, user.password))) {
    return NextResponse.json({ error: "Password is incorrect.", code: "WRONG_PASSWORD" }, { status: 400 });
  }

  let deleted;
  try {
    deleted = await deleteAccount(authUser.id, authUser.role);
  } catch (err) {
    if (err instanceof DeletionBlockedError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  if (!deleted) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const response = NextResponse.json({
    success: true,
    cancelledBookings: deleted.cancelledBookings,
    refundTotal: deleted.refundTotal,
  });
  const cleared = { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax" as const, maxAge: 0, path: "/" };
  response.cookies.set(COOKIE_NAME, "", cleared);
  response.cookies.set(PWRESET_COOKIE_NAME, "", cleared);
  return response;
}
