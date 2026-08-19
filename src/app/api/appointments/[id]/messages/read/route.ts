import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";
import { loadAndAuthorize } from "../route";

// PATCH: mark every message the other party sent in this thread as read by
// the caller — called when a chat thread is opened, so the unread badge on
// the appointment list clears.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUserAny(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await loadAndAuthorize(id, authUser.id);
  if (error) return error;

  await prisma.message.updateMany({
    where: { appointmentId: id, senderId: { not: authUser.id }, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
