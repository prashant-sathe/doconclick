import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { readJson } from "@/lib/routeGuards";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"];
// How a status reads in the patient's push ("Your complaint "X" …").
const STATUS_PHRASE: Record<string, string> = {
  OPEN: "was reopened",
  IN_PROGRESS: "is being looked into",
  RESOLVED: "has been resolved",
};

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

  const existing = await prisma.complaint.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });

  // Nothing to change (a double click, a stale page): answer as if it worked
  // but don't write or notify — the patient is told only about real changes.
  if (existing.status === status) return NextResponse.json(existing);

  // Conditional on the status read above, so two admins setting the same
  // status at once produce one update and one push, not two.
  const { count } = await prisma.complaint.updateMany({
    where: { id, status: { not: status } },
    data: { status },
  });
  const updated = await prisma.complaint.findUniqueOrThrow({ where: { id } });
  if (count === 0) return NextResponse.json(updated);

  // No user-facing complaint page exists yet (only admin GET/PATCH) — the
  // push still surfaces the update even without a page to deep-link into.
  void sendPushToUser(updated.userId, {
    title: "Complaint update",
    body: `Your complaint "${updated.subject}" ${STATUS_PHRASE[status]}.`,
    url: "/",
  });

  return NextResponse.json(updated);
}
