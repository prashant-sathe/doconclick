import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { sendPushToUsers } from "@/lib/firebaseAdmin";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

const RECIPIENT_CHUNK_SIZE = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// POST: Send a draft announcement to its target audience — fans out
// AnnouncementRecipient rows and triggers push notifications.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  const roles =
    announcement.audience === "BOTH" ? ["DOCTOR", "PATIENT"] : [announcement.audience];
  const users = await prisma.user.findMany({
    where: { role: { in: roles }, deletedAt: null },
    select: { id: true, role: true },
  });

  // Atomic guard: only proceeds if this row is still DRAFT, closing the
  // double-send race between two admin tabs clicking Send at once.
  const { count } = await prisma.announcement.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "SENT", sentAt: new Date() },
  });
  if (count === 0) {
    return NextResponse.json({ error: "Already sent" }, { status: 409 });
  }

  for (const batch of chunk(users, RECIPIENT_CHUNK_SIZE)) {
    await prisma.announcementRecipient.createMany({
      data: batch.map((u) => ({ announcementId: id, userId: u.id })),
      skipDuplicates: true,
    });
  }

  const doctorIds = users.filter((u) => u.role === "DOCTOR").map((u) => u.id);
  const patientIds = users.filter((u) => u.role === "PATIENT").map((u) => u.id);
  const pushBody = announcement.message.slice(0, 150);

  await Promise.all([
    doctorIds.length
      ? sendPushToUsers(doctorIds, { title: announcement.title, body: pushBody, url: "/doctor/dashboard" })
      : Promise.resolve(),
    patientIds.length
      ? sendPushToUsers(patientIds, { title: announcement.title, body: pushBody, url: "/patient/dashboard" })
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true, recipientCount: users.length });
}
