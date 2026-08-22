import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { sendPushToUser } from "@/lib/firebaseAdmin";

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const complaints = await prisma.complaint.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, role: true } } },
  });
  return NextResponse.json(complaints);
}

export async function PATCH(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { id, status } = await req.json();
  const updated = await prisma.complaint.update({
    where: { id },
    data: { status },
  });

  // No user-facing complaint page exists yet (only admin GET/PATCH) — the
  // push still surfaces the update even without a page to deep-link into.
  void sendPushToUser(updated.userId, {
    title: "Complaint update",
    body: `Your complaint "${updated.subject}" is now ${status}.`,
    url: "/",
  });

  return NextResponse.json(updated);
}
