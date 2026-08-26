import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthUser, verifyToken, IMPERSONATOR_COOKIE_NAME } from "@/lib/auth";
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

  const cookieStore = await cookies();
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;
  const impersonator = impersonatorToken ? verifyToken(impersonatorToken) : null;

  return NextResponse.json({
    ...user,
    impersonatedBy: impersonator ? { name: impersonator.name, role: impersonator.role } : null,
  });
}
