// Server side of complaint tickets (FP1-17): loading a filer's own ticket,
// the bookings they may link one to, and who hears about a new message.
// Constants and text rules shared with the client are in src/lib/complaints.ts.
import { prisma } from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";
import { sendPushToAdmins, sendPushToUser } from "@/lib/firebaseAdmin";
import { createRateLimiter } from "@/lib/rateLimit";
import { formatProviderName, nameOrMobile } from "@/lib/utils";

// Per user, across all their tickets — a speed bump against flooding the
// support queue (each message also pushes the admins).
export const checkComplaintCreateLimit = createRateLimiter(5, 60 * 60_000);
export const checkComplaintMessageLimit = createRateLimiter(10, 10 * 60_000);

/** Bookings the user took part in — as the patient, or as the doctor/nurse. */
export function ownAppointmentsWhere(user: Pick<JWTPayload, "id" | "role">) {
  return user.role === "PATIENT" ? { patientId: user.id } : { doctorId: user.id };
}

const APPOINTMENT_SUMMARY_SELECT = {
  id: true,
  scheduledAt: true,
  status: true,
  consultType: true,
  providerType: true,
  serviceName: true,
  patientName: true,
  patient: { select: { name: true, mobile: true } },
  doctor: { select: { name: true } },
} as const;

type AppointmentRow = {
  id: string; scheduledAt: Date; status: string; consultType: string; providerType: string;
  serviceName: string | null; patientName: string | null;
  patient: { name: string; mobile: string }; doctor: { name: string };
};

/** A booking as one side sees it: the other party's name, no ids or contact details. */
function summarize(a: AppointmentRow, viewerRole: string) {
  const withName = viewerRole === "PATIENT"
    ? formatProviderName(a.doctor.name, a.providerType)
    : a.patientName || a.patient.name || "";
  return {
    id: a.id,
    scheduledAt: a.scheduledAt,
    status: a.status,
    consultType: a.consultType,
    providerType: a.providerType,
    serviceName: a.serviceName,
    withName,
  };
}

/** The user's most recent bookings, for the "which booking is this about?" picker. */
export async function linkableAppointments(user: Pick<JWTPayload, "id" | "role">) {
  const rows = await prisma.appointment.findMany({
    where: ownAppointmentsWhere(user),
    orderBy: { scheduledAt: "desc" },
    take: 20,
    select: APPOINTMENT_SUMMARY_SELECT,
  });
  return rows.map((a) => summarize(a, user.role));
}

/** The appointment summary for the filer's view, or null when unlinked / not theirs. */
export async function appointmentForFiler(appointmentId: string | null, user: Pick<JWTPayload, "id" | "role">) {
  if (!appointmentId) return null;
  const a = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...ownAppointmentsWhere(user) },
    select: APPOINTMENT_SUMMARY_SELECT,
  });
  return a ? summarize(a, user.role) : null;
}

/** Both sides of a booking, for the admin panel. */
export async function appointmentForAdmin(appointmentId: string | null) {
  if (!appointmentId) return null;
  const a = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: APPOINTMENT_SUMMARY_SELECT });
  if (!a) return null;
  return {
    ...summarize(a, "ADMIN"),
    patientName: nameOrMobile(a.patientName || a.patient.name, a.patient.mobile),
    providerName: formatProviderName(a.doctor.name, a.providerType),
  };
}

/** Admins an admin may assign a ticket to. */
export function assignableAdmins() {
  return prisma.user.findMany({
    where: { role: "ADMIN", deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Tell support about something the filer did: the assignee if there is one,
 * else every admin. Fire-and-forget.
 */
export function notifySupport(
  complaint: { id: string; subject: string; assigneeId: string | null },
  filerName: string,
  key: "adminComplaintNew" | "adminComplaintReply",
) {
  const payload = { key, values: { name: filerName || "A user", subject: complaint.subject }, url: `/admin/complaints/${complaint.id}` } as const;
  void (complaint.assigneeId ? sendPushToUser(complaint.assigneeId, payload) : sendPushToAdmins(payload));
}
