import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Lets the notification-settings toggle show the account's real state
// instead of trusting a per-browser localStorage flag, which goes stale
// whenever the token was registered from a different device/session.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const count = await prisma.pushToken.count({ where: { userId: authUser.id } });
  return NextResponse.json({ subscribed: count > 0 });
}

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

// `token` deletes just that device's subscription (e.g. on logout). Omitting
// it deletes every token for the account — used by the settings-page toggle,
// where "off" means the account stops getting push on any device.
export async function DELETE(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { token } = await req.json().catch(() => ({ token: undefined }));
  if (token !== undefined && typeof token !== "string") {
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });
  }

  await prisma.pushToken.deleteMany({
    where: token ? { token, userId: authUser.id } : { userId: authUser.id },
  });
  return NextResponse.json({ ok: true });
}
