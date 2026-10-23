import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { withErrorLocale } from "@/lib/apiErrors";

const PAGE_SIZE = 30;

// GET ?cursor=<id>: The signed-in user's inbox — every push they were sent
// (src/lib/firebaseAdmin.ts), newest first, PAGE_SIZE at a time. Any role.
export const GET = withErrorLocale(async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const cursor = new URL(req.url).searchParams.get("cursor");
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: authUser.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, title: true, body: true, url: true, kind: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: authUser.id, readAt: null } }),
  ]);

  const items = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({
    items,
    unreadCount,
    nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1].id : null,
  });
});
