import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { AUDIENCES, validateButtons } from "@/lib/announcements";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

// GET: Single announcement with delivery stats
export async function GET(
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

  const [totalRecipients, seenCount] = await Promise.all([
    prisma.announcementRecipient.count({ where: { announcementId: id } }),
    prisma.announcementRecipient.count({ where: { announcementId: id, seenAt: { not: null } } }),
  ]);

  return NextResponse.json({ ...announcement, totalRecipients, seenCount });
}

// PATCH: Update a draft announcement (sent announcements are immutable)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }
  if (existing.status !== "DRAFT") {
    return NextResponse.json({ error: "Only draft announcements can be edited" }, { status: 409 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const trimmed = body.title.trim();
    if (!trimmed) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    data.title = trimmed;
  }
  if (typeof body.message === "string") {
    const trimmed = body.message.trim();
    if (!trimmed) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    data.message = trimmed;
  }
  if ("bannerImageUrl" in body) {
    data.bannerImageUrl = body.bannerImageUrl ? String(body.bannerImageUrl).trim() : null;
  }
  if (typeof body.audience === "string") {
    if (!AUDIENCES.includes(body.audience)) {
      return NextResponse.json({ error: "Audience must be DOCTOR, PATIENT, or BOTH" }, { status: 400 });
    }
    data.audience = body.audience;
  }
  if ("buttons" in body) {
    const buttons = validateButtons(body.buttons);
    if (buttons === null) {
      return NextResponse.json(
        { error: "Buttons must have at most 2 entries, each with a label and a valid url" },
        { status: 400 }
      );
    }
    data.buttons = buttons;
  }

  const announcement = await prisma.announcement.update({ where: { id }, data });
  return NextResponse.json(announcement);
}

// DELETE: Remove a draft announcement (sent announcements are kept as an immutable record)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }
  if (existing.status !== "DRAFT") {
    return NextResponse.json({ error: "Sent announcements cannot be deleted" }, { status: 409 });
  }

  await prisma.announcement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
