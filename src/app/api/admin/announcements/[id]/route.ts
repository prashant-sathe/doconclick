import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { readJson } from "@/lib/routeGuards";
import { AUDIENCES, validateButtons, audienceToRoles } from "@/lib/announcements";
import { isOwnUploadUrl } from "@/lib/s3";

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

  // For sent announcements, count the actual recipients. For drafts, count
  // the live users that would receive it (so the send dialog can show "will be
  // sent to N users" before the admin clicks Send).
  const roles = audienceToRoles(announcement.audience);
  const [totalRecipients, seenCount, recipientCount] = await Promise.all([
    prisma.announcementRecipient.count({ where: { announcementId: id } }),
    prisma.announcementRecipient.count({ where: { announcementId: id, seenAt: { not: null } } }),
    prisma.user.count({ where: { role: { in: roles }, deletedAt: null } }),
  ]);

  return NextResponse.json({ ...announcement, totalRecipients, seenCount, recipientCount });
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

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
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
    const url = body.bannerImageUrl ? String(body.bannerImageUrl).trim() : null;
    // Shown to every user — only an image uploaded through the announcement form.
    if (url && !isOwnUploadUrl(url, "announcement-banners")) {
      return NextResponse.json({ error: "Upload the banner image here — links to other sites aren't allowed." }, { status: 400 });
    }
    data.bannerImageUrl = url;
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
        { error: "Up to 2 buttons, each with a label and a link: a full https:// address, or a page on this site like /patient/wallet." },
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
