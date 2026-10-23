import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { withErrorLocale } from "@/lib/apiErrors";
import { readJson } from "@/lib/routeGuards";

// POST { ids?: string[] }: Mark the user's own notifications read — the given
// ids, or all of them when `ids` is omitted. Idempotent.
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const { ids } = body;
  if (ids !== undefined && (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((id) => typeof id === "string"))) {
    return NextResponse.json({ error: "ids must be a non-empty array of up to 200 ids" }, { status: 400 });
  }

  await prisma.notification.updateMany({
    where: { userId: authUser.id, readAt: null, ...(ids ? { id: { in: ids as string[] } } : {}) },
    data: { readAt: new Date() },
  });
  const unreadCount = await prisma.notification.count({ where: { userId: authUser.id, readAt: null } });
  return NextResponse.json({ ok: true, unreadCount });
});
