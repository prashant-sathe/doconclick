import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { readJson } from "@/lib/routeGuards";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { createRateLimiter } from "@/lib/rateLimit";
import { cleanComplaintText, complaintListHref, COMPLAINT_MESSAGE_MAX } from "@/lib/complaints";

// Generous — admins are trusted — but a stuck client can't spam the filer.
const checkLimit = createRateLimiter(30, 60_000);

// POST { body, internal? }: an admin replies to the filer (internal: false —
// they're pushed and see it on their thread) or leaves an internal note for
// other admins (never shown to the filer, no push).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const text = cleanComplaintText(body.body, COMPLAINT_MESSAGE_MAX);
  if (!text) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  if (body.internal !== undefined && typeof body.internal !== "boolean") {
    return NextResponse.json({ error: "internal must be true or false" }, { status: 400 });
  }
  const internal = body.internal === true;
  if (!checkLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a bit." }, { status: 429 });
  }

  const { id } = await params;
  const complaint = await prisma.complaint.findUnique({
    where: { id },
    select: { id: true, subject: true, userId: true, user: { select: { role: true } } },
  });
  if (!complaint) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });

  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.complaintMessage.create({
      data: { complaintId: id, authorId: authUser.id, fromSupport: true, internal, body: text },
      select: {
        id: true, body: true, fromSupport: true, internal: true, createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });
    if (!internal) {
      await tx.complaint.update({ where: { id }, data: { lastActivityAt: now } });
      // First public reply stops the SLA clock — set once, never moved.
      await tx.complaint.updateMany({ where: { id, firstResponseAt: null }, data: { firstResponseAt: now } });
    }
    return created;
  });

  if (!internal) {
    void sendPushToUser(complaint.userId, {
      key: "complaintReply",
      values: { subject: complaint.subject },
      url: `${complaintListHref(complaint.user.role)}/${id}`,
    });
  }

  return NextResponse.json(message, { status: 201 });
}
