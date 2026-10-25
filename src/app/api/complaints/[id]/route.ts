import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/routeGuards";
import { withErrorLocale } from "@/lib/apiErrors";
import { COMPLAINT_FILER_ROLES, PUBLIC_COMPLAINT_SELECT } from "@/lib/complaints";
import { appointmentForFiler } from "@/lib/complaintAccess";

// GET: one of the caller's own tickets with its public thread. Someone else's
// ticket is a 404 (not 403), so ids can't be probed. Internal notes, priority
// and assignee never leave the admin API; support replies carry no admin name.
export const GET = withErrorLocale(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authUser, denied } = await requireRole(...COMPLAINT_FILER_ROLES);
  if (denied) return denied;

  const { id } = await params;
  const complaint = await prisma.complaint.findFirst({
    where: { id, userId: authUser.id },
    select: {
      ...PUBLIC_COMPLAINT_SELECT,
      messages: {
        where: { internal: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, body: true, fromSupport: true, createdAt: true },
      },
    },
  });
  if (!complaint) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });

  return NextResponse.json({
    ...complaint,
    appointment: await appointmentForFiler(complaint.appointmentId, authUser),
  });
});
