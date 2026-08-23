import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// POST { ids: string[] }: Mark announcements as seen for the current user.
// Idempotent — shared by the popup (one id at a time) and the bell (all
// currently-unseen ids on open).
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || (authUser.role !== "DOCTOR" && authUser.role !== "PATIENT")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }

  await prisma.announcementRecipient.updateMany({
    where: { userId: authUser.id, announcementId: { in: ids }, seenAt: null },
    data: { seenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
