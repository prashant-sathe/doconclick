import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { token, userAgent } = await req.json();
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "Missing push token" }, { status: 400 });
  }

  await prisma.pushToken.upsert({
    where: { token },
    update: { userId: authUser.id, userAgent },
    create: { userId: authUser.id, token, userAgent },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { token } = await req.json();
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "Missing push token" }, { status: 400 });
  }

  await prisma.pushToken.deleteMany({ where: { token, userId: authUser.id } });
  return NextResponse.json({ ok: true });
}
