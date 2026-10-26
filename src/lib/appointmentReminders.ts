import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { isDoctorBookable, DOCTOR_BOOKABLE_SELECT } from "@/lib/doctorBookable";
import { formatDoctorName } from "@/lib/utils";
import { APPOINTMENT_REMINDER_LEADS, DEFAULT_REMINDER_LEADS, parseReminderLeads } from "@/lib/appointmentReminderLeads";

// The provider is reminded roughly an hour before the visit; the patient at
// each lead time they chose (PatientProfile.reminderLeadMinutes).
const REMINDER_LEAD_MS = 60 * 60 * 1000;
// The sweep (see src/instrumentation.ts) runs every 5 minutes — a ±10 minute
// window around each mark guarantees every appointment falls inside at
// least one sweep's window, even if one run is briefly delayed.
const REMINDER_WINDOW_MS = 10 * 60 * 1000;
const MAX_PATIENT_LEAD_MS = Math.max(...APPOINTMENT_REMINDER_LEADS) * 60_000;

/** `only` narrows a sweep to some doctors' appointments (tests run it with chosen clocks). */
type SweepScope = { doctorIds: string[] } | undefined;

// Sends the "your appointment is coming up" pushes for SCHEDULED
// appointments — the provider's ~1 hour before, the patient's at their own
// lead times — and marks each one so a later sweep doesn't send it again.
// Called periodically from src/instrumentation.ts rather than a background
// job — this app has no separate worker process, just the one long-running
// Next.js server.
export async function sendDueAppointmentReminders(now: Date = new Date(), only?: SweepScope) {
  await sendDueProviderReminders(now, only);
  await sendDuePatientReminders(now, only);
}

async function sendDueProviderReminders(now: Date, only: SweepScope) {
  const windowStart = new Date(now.getTime() + REMINDER_LEAD_MS - REMINDER_WINDOW_MS);
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MS + REMINDER_WINDOW_MS);

  const due = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      reminderSentAt: null,
      scheduledAt: { gte: windowStart, lte: windowEnd },
      ...(only ? { doctorId: { in: only.doctorIds } } : {}),
    },
    select: {
      id: true,
      doctorId: true,
      patientName: true,
      providerType: true,
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
    void sendPushToUser(a.doctorId, {
      key: "reminderProvider",
      values: { patient: a.patientName ?? a.patient.name },
      url: a.providerType === "NURSE" ? "/nurse/dashboard" : "/doctor/dashboard",
    });
  }
}

// One push per lead time the patient chose ("1 day", "1 hour" …), for doctor
// and nurse visits alike. A lead is due when the visit is within ±10 minutes
// of it — so a visit confirmed 40 minutes ahead gets no "1 hour" reminder,
// only the later ones. Several leads due at once (a visit confirmed late)
// send one push, worded for the nearest. Claimed row by row on what was read
// (patientRemindersSent / patientRemindersFor), so two sweeps can't both send.
async function sendDuePatientReminders(now: Date, only: SweepScope) {
  const due = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { gt: now, lte: new Date(now.getTime() + MAX_PATIENT_LEAD_MS + REMINDER_WINDOW_MS) },
      ...(only ? { doctorId: { in: only.doctorIds } } : {}),
    },
    select: {
      id: true,
      consultType: true,
      patientId: true,
      scheduledAt: true,
      patientRemindersSent: true,
      patientRemindersFor: true,
      doctor: { select: { name: true } },
      patient: { select: { deletedAt: true, patientProfile: { select: { reminderLeadMinutes: true } } } },
    },
  });
  for (const a of due) {
    if (a.patient.deletedAt) continue;
    const leads = parseReminderLeads(a.patient.patientProfile?.reminderLeadMinutes ?? DEFAULT_REMINDER_LEADS);
    // Reminders sent for an earlier time of this appointment don't count.
    const sent = a.patientRemindersFor?.getTime() === a.scheduledAt.getTime() ? parseReminderLeads(a.patientRemindersSent) : [];
    const left = a.scheduledAt.getTime() - now.getTime();
    const dueLeads = leads.filter((l) => !sent.includes(l) && Math.abs(left - l * 60_000) <= REMINDER_WINDOW_MS);
    if (dueLeads.length === 0) continue;
    const { count } = await prisma.appointment.updateMany({
      where: {
        id: a.id, status: "SCHEDULED", scheduledAt: a.scheduledAt,
        patientRemindersSent: a.patientRemindersSent, patientRemindersFor: a.patientRemindersFor,
      },
      data: { patientRemindersFor: a.scheduledAt, patientRemindersSent: [...sent, ...dueLeads].join(",") },
    });
    if (count === 0) continue;
    await sendPushToUser(a.patientId, {
      key: "reminderPatientLead",
      values: { doctor: a.doctor.name, consultType: a.consultType, lead: String(Math.min(...dueLeads)), when: a.scheduledAt },
      url: "/patient/appointments",
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
