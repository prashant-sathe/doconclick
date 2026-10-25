import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/routeGuards";
import { withErrorLocale } from "@/lib/apiErrors";
import { PUBLIC_COMPLAINT_SELECT } from "@/lib/complaints";

// GET: the current doctor's own support tickets — raised via the Support
// Assistant chat's create_support_ticket tool, listed here with a link to
// each ticket's reply thread. Open to a suspended doctor too: the suspension
// message tells them to contact support, and this is where support answers.
export const GET = withErrorLocale(async function GET() {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return denied;

  const complaints = await prisma.complaint.findMany({
    where: { userId: authUser.id },
    orderBy: { createdAt: "desc" },
    select: {
      ...PUBLIC_COMPLAINT_SELECT,
      messages: { where: { internal: false }, orderBy: { createdAt: "desc" }, take: 1, select: { fromSupport: true } },
      _count: { select: { messages: { where: { internal: false } } } },
    },
  });

  return NextResponse.json(complaints.map(({ messages, _count, ...c }) => ({
    ...c,
    replyCount: _count.messages,
    supportRepliedLast: messages[0]?.fromSupport ?? false,
  })));
});
