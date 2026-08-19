import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/pushNotifications";

export const APPOINTMENT_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

// Auto-expires appointment requests the doctor never responded to within
// the timeout window. Called lazily from read/write routes rather than a
// background job — cheap no-op when nothing is stale.
export async function expireStalePendingRequests() {
  const cutoff = new Date(Date.now() - APPOINTMENT_REQUEST_TIMEOUT_MS);
  const stale = await prisma.appointment.findMany({
    where: { status: "PENDING_APPROVAL", createdAt: { lt: cutoff } },
    select: { id: true, patientId: true },
  });

  await prisma.appointment.updateMany({
    where: { status: "PENDING_APPROVAL", createdAt: { lt: cutoff } },
    data: { status: "EXPIRED" },
  });

  for (const appt of stale) {
    sendPushToUser(appt.patientId, {
      title: "Booking request expired",
      body: "The doctor didn't respond in time. Please try booking again.",
      data: { type: "appointment_status", appointmentId: appt.id, status: "EXPIRED" },
    });
  }
}
