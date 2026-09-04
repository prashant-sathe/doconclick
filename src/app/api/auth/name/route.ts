import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, signToken, COOKIE_SECURE, type JWTPayload } from "@/lib/auth";
import { nameError } from "@/lib/validation";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// PATCH: lets any authenticated user (patient, doctor, admin) rename their
// own account. name lives on User, not a role-specific profile table.
export async function PATCH(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { name } = await req.json().catch(() => ({ name: undefined }));
  const trimmed = String(name ?? "").trim();
  const err = nameError(trimmed);
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: authUser.id },
    data: { name: trimmed },
  });

  const payload: JWTPayload = {
    id: updated.id,
    name: updated.name,
    role: updated.role,
    mobile: updated.mobile,
  };
  const token = signToken(payload);

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
