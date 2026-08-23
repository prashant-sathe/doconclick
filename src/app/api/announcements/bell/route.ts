import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: Recent sent announcements for the current doctor/patient, for the
// notification bell dropdown — a history view, not just unseen ones.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || (authUser.role !== "DOCTOR" && authUser.role !== "PATIENT")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const recipients = await prisma.announcementRecipient.findMany({
    where: { userId: authUser.id, announcement: { status: "SENT" } },
    include: { announcement: true },
    orderBy: { announcement: { sentAt: "desc" } },
    take: 10,
  });

  const announcements = recipients.map((r) => ({
    ...r.announcement,
    seen: r.seenAt != null,
  }));
  return NextResponse.json(announcements);
}
