import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword } from "@/lib/auth";

// PATCH: Set a new password for the logged-in user. Reached only after the
// forgot-password flow verifies identity via "Sign in with Google" — the
// session cookie itself is the proof of auth here, same as any other
// authenticated route.
export async function PATCH(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { password } = await req.json().catch(() => ({ password: undefined }));
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const hashed = await hashPassword(password);
  await prisma.user.update({
    where: { id: authUser.id },
    data: { password: hashed },
  });

  return NextResponse.json({ success: true });
}
