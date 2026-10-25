import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { withErrorLocale } from "@/lib/apiErrors";
import {
  cleanComplaintText, COMPLAINT_FILER_ROLES, COMPLAINT_MAX_USER_MESSAGES, COMPLAINT_MESSAGE_MAX,
} from "@/lib/complaints";
import { checkComplaintMessageLimit, notifySupport } from "@/lib/complaintAccess";

// POST: the filer adds a reply to their own ticket. Replying to a resolved
// ticket reopens it — the issue clearly isn't over for them.
export const POST = withErrorLocale(async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authUser, denied } = await requireRole(...COMPLAINT_FILER_ROLES);
  if (denied) return denied;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const text = cleanComplaintText(body.body, COMPLAINT_MESSAGE_MAX);
  if (!text) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });

  const { id } = await params;
  const complaint = await prisma.complaint.findFirst({
    where: { id, userId: authUser.id },
    select: { id: true, subject: true, assigneeId: true },
  });
  if (!complaint) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });

  const mine = await prisma.complaintMessage.count({ where: { complaintId: id, fromSupport: false } });
  if (mine >= COMPLAINT_MAX_USER_MESSAGES) {
    return NextResponse.json({ error: "This ticket has too many messages. Please raise a new ticket." }, { status: 409 });
  }
  if (!checkComplaintMessageLimit(authUser.id)) {
    return NextResponse.json({ error: "You're sending messages too quickly. Please wait a few minutes and try again." }, { status: 429 });
  }

  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.complaintMessage.create({
      data: { complaintId: id, authorId: authUser.id, fromSupport: false, internal: false, body: text },
      select: { id: true, body: true, fromSupport: true, createdAt: true },
    });
    await tx.complaint.update({ where: { id }, data: { lastActivityAt: now } });
    // Conditional, so a reply racing an admin's status change can't undo it
    // unless the ticket really was resolved at this moment.
    await tx.complaint.updateMany({ where: { id, status: "RESOLVED" }, data: { status: "OPEN", resolvedAt: null } });
    return created;
  });
  notifySupport(complaint, authUser.name, "adminComplaintReply");

  const { status } = await prisma.complaint.findUniqueOrThrow({ where: { id }, select: { status: true } });
  return NextResponse.json({ message, status }, { status: 201 });
});
