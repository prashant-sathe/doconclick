import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/firebaseAdmin";

// Remind roughly an hour before the visit.
const REMINDER_LEAD_MS = 60 * 60 * 1000;
// The sweep (see src/instrumentation.ts) runs every 5 minutes — a ±10 minute
// window around the 1-hour mark guarantees every appointment falls inside at
// least one sweep's window, even if one run is briefly delayed.
const REMINDER_WINDOW_MS = 10 * 60 * 1000;

const CONSULT_TYPE_PATIENT_COPY: Record<string, (doctorName: string) => string> = {
  HOME: (d) => `${d} is visiting you in about an hour.`,
  CLINIC: (d) => `Your clinic visit with ${d} is in about an hour.`,
  VIDEO: (d) => `Your video consultation with ${d} is in about an hour.`,
};

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
    const patientBody = (CONSULT_TYPE_PATIENT_COPY[a.consultType] ?? CONSULT_TYPE_PATIENT_COPY.CLINIC)(a.doctor.name);
    void sendPushToUser(a.patientId, {
      title: "Upcoming appointment",
      body: patientBody,
      url: "/patient/appointments",
    });
    void sendPushToUser(a.doctorId, {
      title: "Upcoming appointment",
      body: `You have an appointment with ${a.patientName ?? a.patient.name} in about an hour.`,
      url: "/doctor/dashboard",
    });
  }
}
