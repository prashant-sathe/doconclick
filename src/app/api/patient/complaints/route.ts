import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { withErrorLocale } from "@/lib/apiErrors";
import { normalizeMobile, isValidMobile } from "@/lib/validation";
import {
  cleanComplaintText, COMPLAINT_DESCRIPTION_MAX, COMPLAINT_SUBJECT_MAX, PUBLIC_COMPLAINT_SELECT,
} from "@/lib/complaints";
import { checkComplaintCreateLimit, notifySupport, ownAppointmentsWhere } from "@/lib/complaintAccess";

// Shared by patients and nurses (nurses have no separate support channel).
// GET: the current user's own support tickets
export const GET = withErrorLocale(async function GET() {
  const { authUser, denied } = await requireRole("PATIENT", "NURSE");
  if (denied) return denied;

  const complaints = await prisma.complaint.findMany({
    where: { userId: authUser.id },
    orderBy: { createdAt: "desc" },
    select: {
      ...PUBLIC_COMPLAINT_SELECT,
      // Whether support has the last word (shown as "Support replied").
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

// POST: raise a new support ticket — optionally about one of the user's own
// bookings, with a callback number other than the account mobile.
export const POST = withErrorLocale(async function POST(req: Request) {
  const { authUser, denied } = await requireRole("PATIENT", "NURSE");
  if (denied) return denied;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const { subject, description, appointmentId, contactMobile } = body;
  const trimmedSubject = cleanComplaintText(subject, COMPLAINT_SUBJECT_MAX);
  const trimmedDescription = cleanComplaintText(description, COMPLAINT_DESCRIPTION_MAX);
  if (!trimmedSubject || !trimmedDescription) {
    return NextResponse.json({ error: "Subject and description are required" }, { status: 400 });
  }

  let linkedAppointmentId: string | null = null;
  if (appointmentId !== undefined && appointmentId !== null && appointmentId !== "") {
    if (typeof appointmentId !== "string") {
      return NextResponse.json({ error: "That booking wasn't found." }, { status: 400 });
    }
    // Only a booking the user was part of — never someone else's by id.
    const own = await prisma.appointment.findFirst({ where: { id: appointmentId, ...ownAppointmentsWhere(authUser) }, select: { id: true } });
    if (!own) return NextResponse.json({ error: "That booking wasn't found." }, { status: 400 });
    linkedAppointmentId = own.id;
  }

  let callback: string | null = null;
  if (contactMobile !== undefined && contactMobile !== null && String(contactMobile).trim() !== "") {
    if (typeof contactMobile !== "string" || !isValidMobile(contactMobile)) {
      return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
    }
    callback = normalizeMobile(contactMobile);
  }

  if (!checkComplaintCreateLimit(authUser.id)) {
    return NextResponse.json({ error: "You've raised several tickets in a short time. Please wait a while, or add to an existing ticket." }, { status: 429 });
  }

  const complaint = await prisma.complaint.create({
    data: {
      userId: authUser.id,
      subject: trimmedSubject,
      description: trimmedDescription,
      appointmentId: linkedAppointmentId,
      contactMobile: callback,
    },
    select: { ...PUBLIC_COMPLAINT_SELECT, assigneeId: true },
  });
  notifySupport(complaint, authUser.name, "adminComplaintNew");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { assigneeId, ...publicTicket } = complaint;
  return NextResponse.json({ ...publicTicket, replyCount: 0, supportRepliedLast: false }, { status: 201 });
});
