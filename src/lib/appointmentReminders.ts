import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { isDoctorBookable, DOCTOR_BOOKABLE_SELECT } from "@/lib/doctorBookable";
import { formatDoctorName } from "@/lib/utils";

// Remind roughly an hour before the visit.
const REMINDER_LEAD_MS = 60 * 60 * 1000;
// The sweep (see src/instrumentation.ts) runs every 5 minutes — a ±10 minute
// window around the 1-hour mark guarantees every appointment falls inside at
// least one sweep's window, even if one run is briefly delayed.
const REMINDER_WINDOW_MS = 10 * 60 * 1000;


// Sends the "your appointment is coming up" push to both sides of a
// SCHEDULED appointment once it's about an hour away, and marks it so a
// later sweep doesn't send it again. Called periodically from
// src/instrumentation.ts rather than a background job — this app has no
// separate worker process, just the one long-running Next.js server.
export async function sendDueAppointmentReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + REMINDER_LEAD_MS - REMINDER_WINDOW_MS);
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MS + REMINDER_WINDOW_MS);

  const due = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      reminderSentAt: null,
      scheduledAt: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      consultType: true,
      patientId: true,
      doctorId: true,
      patientName: true,
      providerType: true,
      doctor: { select: { name: true } },
      patient: { select: { name: true } },
    },
  });
  if (due.length === 0) return;

  // Mark first so a slow push send (or a crash mid-loop) can't cause a
  // duplicate reminder on the next sweep.
  await prisma.appointment.updateMany({
    where: { id: { in: due.map((a) => a.id) } },
    data: { reminderSentAt: now },
  });

  for (const a of due) {
    void sendPushToUser(a.patientId, {
      key: "reminderPatient",
      values: { doctor: a.doctor.name, consultType: a.consultType },
      url: "/patient/appointments",
    });
    void sendPushToUser(a.doctorId, {
      key: "reminderProvider",
      values: { patient: a.patientName ?? a.patient.name },
      url: a.providerType === "NURSE" ? "/nurse/dashboard" : "/doctor/dashboard",
    });
  }
}

// The follow-up reminder goes out from 6 pm IST the evening before the day
// the doctor suggested (followUpDate is that day's first instant, IST) —
// time enough to book — and no later than the end of that day.
const FOLLOW_UP_LEAD_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_STATUSES = ["PENDING_APPROVAL", "SCHEDULED"];

// "Time for your follow-up with Dr X" — once per completed consultation
// (followUpReminderSentAt, claimed row by row so two sweeps can't both
// send). Skipped, but still marked, when the patient has already booked this
// doctor again (a follow-up of this visit, or any live booking on/after the
// day), the patient's account is deleted, or the doctor can't be booked.
// Same 5-minute sweep as above (src/instrumentation.ts).
export async function sendDueFollowUpReminders(now: Date = new Date()) {
  const due = await prisma.appointment.findMany({
    where: {
      status: "COMPLETED",
      providerType: "DOCTOR",
      followUpReminderSentAt: null,
      followUpDate: { lte: new Date(now.getTime() + FOLLOW_UP_LEAD_MS), gt: new Date(now.getTime() - DAY_MS) },
    },
    select: {
      id: true,
      patientId: true,
      doctorId: true,
      followUpDate: true,
      patient: { select: { deletedAt: true } },
      doctor: { select: { name: true, ...DOCTOR_BOOKABLE_SELECT } },
    },
  });
  let sent = 0;
  for (const a of due) {
    const { count } = await prisma.appointment.updateMany({
      where: { id: a.id, followUpReminderSentAt: null, followUpDate: a.followUpDate },
      data: { followUpReminderSentAt: now },
    });
    if (count === 0) continue;
    if (a.patient.deletedAt || !isDoctorBookable(a.doctor)) continue;
    const rebooked = await prisma.appointment.findFirst({
      where: {
        patientId: a.patientId,
        doctorId: a.doctorId,
        OR: [
          { followUpOfId: a.id, status: { in: [...LIVE_STATUSES, "COMPLETED"] } },
          { status: { in: LIVE_STATUSES }, scheduledAt: { gte: a.followUpDate! } },
        ],
      },
      select: { id: true },
    });
    if (rebooked) continue;
    await sendPushToUser(a.patientId, {
      key: "followUpReminder",
      values: { doctor: formatDoctorName(a.doctor.name), date: a.followUpDate! },
      url: "/patient/appointments",
    });
    sent++;
  }
  return sent;
}
