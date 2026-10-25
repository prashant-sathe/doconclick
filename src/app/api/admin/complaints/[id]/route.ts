import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { complaintSla } from "@/lib/complaints";
import { appointmentForAdmin, assignableAdmins, linkableAppointments } from "@/lib/complaintAccess";

// GET: one ticket for the admin panel — the whole thread including internal
// notes, the filer's contact details, triage fields and SLA.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const complaint = await prisma.complaint.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, mobile: true, email: true, role: true, deletedAt: true, createdAt: true } },
      assignee: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, body: true, fromSupport: true, internal: true, createdAt: true,
          author: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!complaint) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });

  const [appointment, userAppointments, admins, otherTickets] = await Promise.all([
    appointmentForAdmin(complaint.appointmentId),
    linkableAppointments({ id: complaint.user.id, role: complaint.user.role }),
    assignableAdmins(),
    prisma.complaint.count({ where: { userId: complaint.userId, id: { not: id } } }),
  ]);

  return NextResponse.json({
    ...complaint,
    sla: complaintSla(complaint),
    appointment,
    userAppointments,
    admins,
    otherTickets,
  });
}
