import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthUser, verifySession, IMPERSONATOR_COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SUSPENDED_MESSAGE } from "@/lib/doctorGuard";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Distinguish "suspended" from "logged out" here specifically — this is
  // the one endpoint the client's AuthProvider polls to decide what to
  // render, so a suspended doctor needs a clear reason, not just a 401
  // that looks identical to an expired session.
  if (user.role === "DOCTOR") {
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (profile?.status === "SUSPENDED") {
      return NextResponse.json(
        { ...user, suspended: true, suspendedMessage: SUSPENDED_MESSAGE },
        { status: 403 }
      );
    }
  }

  if (user.role === "NURSE") {
    const profile = await prisma.nurseProfile.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (profile?.status === "SUSPENDED") {
      return NextResponse.json(
        { ...user, suspended: true, suspendedMessage: SUSPENDED_MESSAGE },
        { status: 403 }
      );
    }
  }

  const cookieStore = await cookies();
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;
  const impersonator = impersonatorToken ? await verifySession(impersonatorToken) : null;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { termsAcceptedAt: true, password: true },
  });

  return NextResponse.json({
    ...user,
    termsAcceptedAt: dbUser?.termsAcceptedAt ?? null,
    // Google-only accounts have none; the security pages then offer
    // "verify with Google to set one" instead of asking for a current password.
    hasPassword: !!dbUser?.password,
    impersonatedBy: impersonator ? { name: impersonator.name, role: impersonator.role } : null,
  });
}
