import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromBearer } from "@/lib/auth";

// Registers/unregisters an FCM device token for the logged-in mobile user.
export async function POST(req: Request) {
  const authUser = getAuthUserFromBearer(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { token, platform } = await req.json();
  if (!token || (platform !== "android" && platform !== "ios")) {
    return NextResponse.json({ error: "token and platform ('android' | 'ios') are required." }, { status: 400 });
  }

  await prisma.deviceToken.upsert({
    where: { token },
    update: { userId: authUser.id, platform },
    create: { userId: authUser.id, token, platform },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const authUser = getAuthUserFromBearer(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { token } = await req.json();
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  await prisma.deviceToken.deleteMany({ where: { token, userId: authUser.id } });
  return NextResponse.json({ success: true });
}
