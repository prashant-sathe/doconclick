import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthUser,
  signToken,
  COOKIE_SECURE,
  IMPERSONATOR_COOKIE_NAME,
  type JWTPayload,
} from "@/lib/auth";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { userId } = await params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (target.deletedAt) {
    return NextResponse.json({ error: "Cannot impersonate a deleted account." }, { status: 400 });
  }
  if (target.role === "ADMIN") {
    return NextResponse.json({ error: "Cannot impersonate another admin." }, { status: 403 });
  }

  const targetPayload: JWTPayload = {
    id: target.id,
    name: target.name,
    role: target.role,
    mobile: target.mobile,
  };
  const adminPayload: JWTPayload = {
    id: authUser.id,
    name: authUser.name,
    role: authUser.role,
    mobile: authUser.mobile,
  };

  await prisma.impersonationLog.create({
    data: { adminId: authUser.id, targetUserId: target.id },
  });

  const response = NextResponse.json({ role: target.role });

  response.cookies.set(COOKIE_NAME, signToken(targetPayload), {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  response.cookies.set(IMPERSONATOR_COOKIE_NAME, signToken(adminPayload), {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}
