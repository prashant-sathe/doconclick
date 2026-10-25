import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/adminAuth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { readJson } from "@/lib/routeGuards";
import { assignableAdmins } from "@/lib/complaintAccess";
import {
  complaintListHref, complaintSla, isComplaintPriority, isComplaintStatus, slaBreachedWhere,
} from "@/lib/complaints";

// How each status reads in the filer's push: messages/<locale>/push.json complaintUpdate.

const LIST_LIMIT = 200;

// GET ?status=&priority=&assignee=me|unassigned|<adminId>&role=&q=&sla=breached
export async function GET(req: Request) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const sp = new URL(req.url).searchParams;
  const and: Prisma.ComplaintWhereInput[] = [];
  const status = sp.get("status");
  if (status === "ACTIVE") and.push({ status: { not: "RESOLVED" } });
  else if (isComplaintStatus(status)) and.push({ status });
  const priority = sp.get("priority");
  if (isComplaintPriority(priority)) and.push({ priority });
  const assignee = sp.get("assignee");
  if (assignee === "me") and.push({ assigneeId: authUser.id });
  else if (assignee === "unassigned") and.push({ assigneeId: null });
  else if (assignee) and.push({ assigneeId: assignee });
  const role = sp.get("role");
  if (role === "PATIENT" || role === "NURSE" || role === "DOCTOR") and.push({ user: { role } });
  if (sp.get("sla") === "breached") and.push(slaBreachedWhere());
  const q = sp.get("q")?.trim().slice(0, 100);
  if (q) {
    and.push({
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { mobile: { contains: q } } },
        { contactMobile: { contains: q } },
        { id: q },
      ],
    });
  }

  const where: Prisma.ComplaintWhereInput = and.length ? { AND: and } : {};
  const [rows, total, admins] = await Promise.all([
    prisma.complaint.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      take: LIST_LIMIT,
      include: {
        user: { select: { name: true, mobile: true, role: true } },
        assignee: { select: { id: true, name: true } },
        messages: { where: { internal: false }, orderBy: { createdAt: "desc" }, take: 1, select: { fromSupport: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.complaint.count({ where }),
    assignableAdmins(),
  ]);

  const now = new Date();
  const complaints = rows.map(({ messages, _count, ...c }) => ({
    ...c,
    messageCount: _count.messages,
    // Support owes the next reply: nobody has answered yet, or the filer wrote last.
    awaitingSupport: c.status !== "RESOLVED" && !(messages[0]?.fromSupport ?? false),
    sla: complaintSla(c, now),
  }));
  return NextResponse.json({ complaints, total, limit: LIST_LIMIT, admins });
}

// PATCH { id, status?, priority?, assigneeId? (null = unassign), appointmentId? (null = unlink) }
export async function PATCH(req: Request) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const { id, status, priority, assigneeId, appointmentId } = body;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Missing complaint id" }, { status: 400 });
  }
  const hasOther = priority !== undefined || assigneeId !== undefined || appointmentId !== undefined;
  if (status !== undefined || !hasOther) {
    if (typeof status !== "string" || !isComplaintStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
  }
  if (priority !== undefined && !isComplaintPriority(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }
  if (assigneeId !== undefined && assigneeId !== null && typeof assigneeId !== "string") {
    return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
  }
  if (appointmentId !== undefined && appointmentId !== null && typeof appointmentId !== "string") {
    return NextResponse.json({ error: "Invalid appointment" }, { status: 400 });
  }

  const existing = await prisma.complaint.findUnique({ where: { id }, include: { user: { select: { role: true } } } });
  if (!existing) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });

  // ── Triage fields: no push to the filer, they never see these ──
  const data: Prisma.ComplaintUncheckedUpdateInput = {};
  if (priority !== undefined && priority !== existing.priority) data.priority = priority;
  if (assigneeId !== undefined && assigneeId !== existing.assigneeId) {
    if (assigneeId) {
      const admin = await prisma.user.findFirst({ where: { id: assigneeId, role: "ADMIN", deletedAt: null }, select: { id: true } });
      if (!admin) return NextResponse.json({ error: "Assignee must be an admin" }, { status: 400 });
    }
    data.assigneeId = assigneeId;
  }
  if (appointmentId !== undefined && appointmentId !== existing.appointmentId) {
    if (appointmentId) {
      const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true } });
      if (!appt) return NextResponse.json({ error: "Appointment not found" }, { status: 400 });
    }
    data.appointmentId = appointmentId;
  }
  if (Object.keys(data).length) {
    await prisma.complaint.update({ where: { id }, data });
    if (typeof data.assigneeId === "string" && data.assigneeId !== authUser.id) {
      void sendPushToUser(data.assigneeId, {
        key: "adminComplaintAssigned",
        values: { subject: existing.subject },
        url: `/admin/complaints/${id}`,
      });
    }
  }

  // ── Status: the filer is told only about real changes ──
  // Nothing to change (a double click, a stale page): answer as if it worked
  // but don't write or notify.
  if (typeof status === "string" && existing.status !== status) {
    // Conditional on the status read above, so two admins setting the same
    // status at once produce one update and one push, not two.
    const { count } = await prisma.complaint.updateMany({
      where: { id, status: { not: status } },
      data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
    });
    if (count > 0) {
      void sendPushToUser(existing.userId, {
        key: "complaintUpdate",
        values: { subject: existing.subject, status },
        url: `${complaintListHref(existing.user.role)}/${id}`,
      });
    }
  }

  return NextResponse.json(await prisma.complaint.findUniqueOrThrow({ where: { id } }));
}
