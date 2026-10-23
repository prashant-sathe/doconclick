import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: { count } of unread inbox notifications — the header badge's poll.
export const GET = withErrorLocale(async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const count = await prisma.notification.count({ where: { userId: authUser.id, readAt: null } });
  return NextResponse.json({ count });
});
