import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, signToken, sessionPayload, COOKIE_SECURE } from "@/lib/auth";
import { parseBody, updateNameSchema } from "@/lib/schemas";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// PATCH: lets any authenticated user (patient, doctor, admin) rename their
// own account. name lives on User, not a role-specific profile table.
export async function PATCH(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = parseBody(updateNameSchema, await req.json().catch(() => null));
  if (parsed.response) return parsed.response;
  const trimmed = parsed.data.name;

  const updated = await prisma.user.update({
    where: { id: authUser.id },
    data: { name: trimmed },
  });

  const token = signToken(sessionPayload(updated));

  const response = NextResponse.json({ id: updated.id, name: updated.name, role: updated.role });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
