import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { releaseCouponRedemption } from "@/lib/coupons";

export const APPOINTMENT_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

// Auto-expires appointment requests the doctor never responded to within
// the timeout window. Called lazily from read/write routes rather than a
// background job — cheap no-op when nothing is stale.
export async function expireStalePendingRequests() {
  const cutoff = new Date(Date.now() - APPOINTMENT_REQUEST_TIMEOUT_MS);
  const stale = await prisma.appointment.findMany({
    where: { status: "PENDING_APPROVAL", createdAt: { lt: cutoff } },
    select: { id: true, patientId: true, doctor: { select: { name: true } } },
  });
  if (stale.length === 0) return;

  await prisma.appointment.updateMany({
    where: { id: { in: stale.map((a) => a.id) } },
    data: { status: "EXPIRED" },
  });

  // Free any coupon slots that were reserved but never paid for.
  const reserved = await prisma.couponRedemption.findMany({
    where: { appointmentId: { in: stale.map((a) => a.id) }, status: "RESERVED" },
    select: { appointmentId: true },
  });
  for (const r of reserved) {
    if (r.appointmentId) await releaseCouponRedemption(prisma, { appointmentId: r.appointmentId });
  }

  for (const a of stale) {
    void sendPushToUser(a.patientId, {
      title: "No response from doctor",
      body: `${a.doctor.name} didn't respond in time.`,
      url: "/patient/appointments",
    });
  }
}
