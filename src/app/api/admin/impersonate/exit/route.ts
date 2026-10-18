import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession, verifyToken, signToken, COOKIE_SECURE, IMPERSONATOR_COOKIE_NAME } from "@/lib/auth";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function POST() {
  const cookieStore = await cookies();

  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;
  // verifySession, not verifyToken: an admin removed or revoked mid-
  // impersonation must not be able to "exit" back into the admin panel.
  const impersonatorPayload = impersonatorToken ? await verifySession(impersonatorToken) : null;
  if (!impersonatorPayload) {
    return NextResponse.json({ error: "Not currently impersonating." }, { status: 400 });
  }

  const currentToken = cookieStore.get(COOKIE_NAME)?.value;
  const currentPayload = currentToken ? verifyToken(currentToken) : null;

  if (currentPayload) {
    const openLog = await prisma.impersonationLog.findFirst({
      where: { adminId: impersonatorPayload.id, targetUserId: currentPayload.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (openLog) {
      await prisma.impersonationLog.update({
        where: { id: openLog.id },
        data: { endedAt: new Date() },
      });
    }
  }

  const adminPayload = impersonatorPayload;

  const response = NextResponse.json({ role: adminPayload.role });

  response.cookies.set(COOKIE_NAME, signToken(adminPayload), {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  response.cookies.set(IMPERSONATOR_COOKIE_NAME, "", {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
