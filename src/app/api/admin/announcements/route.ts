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

// GET: All announcements for the admin management table
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recipients: true } } },
  });
  return NextResponse.json(announcements);
}

// POST: Create a new draft announcement
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const authUser = (await getAuthUser())!;

  const body = await req.json();
  const title = String(body.title ?? "").trim();
  const message = String(body.message ?? "").trim();
  const bannerImageUrl = body.bannerImageUrl ? String(body.bannerImageUrl).trim() : null;
  const audience = String(body.audience ?? "").trim();

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
  if (!AUDIENCES.includes(audience)) {
    return NextResponse.json({ error: "Audience must be DOCTOR, PATIENT, or BOTH" }, { status: 400 });
  }

  const buttons = validateButtons(body.buttons);
  if (buttons === null) {
    return NextResponse.json(
      { error: "Buttons must have at most 2 entries, each with a label and a valid url" },
      { status: 400 }
    );
  }

  const announcement = await prisma.announcement.create({
    data: {
      title,
      message,
      bannerImageUrl,
      audience,
      buttons,
      createdByUserId: authUser.id,
    },
  });
  return NextResponse.json(announcement);
}
