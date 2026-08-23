import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: The current doctor/patient's unseen sent announcements, oldest first
// so nothing sent while they were offline gets skipped.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || (authUser.role !== "DOCTOR" && authUser.role !== "PATIENT")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const recipients = await prisma.announcementRecipient.findMany({
    where: { userId: authUser.id, seenAt: null, announcement: { status: "SENT" } },
    include: { announcement: true },
    orderBy: { announcement: { sentAt: "asc" } },
  });

  const announcements = recipients.map((r) => r.announcement);
  return NextResponse.json(announcements);
}
