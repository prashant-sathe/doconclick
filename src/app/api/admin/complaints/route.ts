import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { readJson, isRecordNotFound } from "@/lib/routeGuards";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"];

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

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const { id, status } = body;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Missing complaint id" }, { status: 400 });
  }
  if (typeof status !== "string" || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let updated;
  try {
    updated = await prisma.complaint.update({ where: { id }, data: { status } });
  } catch (err) {
    if (isRecordNotFound(err)) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    throw err;
  }

  // No user-facing complaint page exists yet (only admin GET/PATCH) — the
  // push still surfaces the update even without a page to deep-link into.
  void sendPushToUser(updated.userId, {
    title: "Complaint update",
    body: `Your complaint "${updated.subject}" is now ${status}.`,
    url: "/",
  });

  return NextResponse.json(updated);
}
