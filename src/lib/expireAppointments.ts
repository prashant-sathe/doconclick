import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { releaseCouponRedemption } from "@/lib/coupons";

export const APPOINTMENT_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

// Auto-expires appointment requests the doctor never responded to within
// the timeout window. Called lazily from read/write routes rather than a
// background job — cheap no-op when nothing is stale.
export async function expireStalePendingRequests() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - APPOINTMENT_REQUEST_TIMEOUT_MS);
  const stale = await prisma.appointment.findMany({
    // A request expires only once BOTH are true: the 30-min response window
    // has passed AND the appointment's own scheduled time is in the past.
    // For a "book now" request scheduledAt ≈ createdAt, so the second clause
    // is a no-op and behaviour is unchanged. For a request scheduled days
    // out, the doctor has until the appointment time to respond — no timer.
    where: {
      status: "PENDING_APPROVAL",
      createdAt: { lt: cutoff },
      scheduledAt: { lt: now },
    },
    select: { id: true, patientId: true, providerType: true, packageId: true, doctor: { select: { name: true } } },
  });
  if (stale.length === 0) return;

  // A nurse package is answered as a whole — once its first visit times out
  // unanswered, the rest of its still-pending visits go with it (otherwise
  // they would sit "waiting" until each one's own date).
  const packageIds = [...new Set(stale.map((a) => a.packageId).filter((x): x is string => !!x))];
  const siblings = packageIds.length
    ? await prisma.appointment.findMany({
        where: { packageId: { in: packageIds }, status: "PENDING_APPROVAL", id: { notIn: stale.map((a) => a.id) } },
        select: { id: true },
      })
    : [];
  const expiredIds = [...stale.map((a) => a.id), ...siblings.map((a) => a.id)];

  await prisma.appointment.updateMany({
    where: { id: { in: expiredIds } },
    data: { status: "EXPIRED" },
  });

  // Free any coupon slots that were reserved but never paid for.
  const reserved = await prisma.couponRedemption.findMany({
    where: { appointmentId: { in: expiredIds }, status: "RESERVED" },
    select: { appointmentId: true },
  });
  for (const r of reserved) {
    if (r.appointmentId) await releaseCouponRedemption(prisma, { appointmentId: r.appointmentId });
  }

  for (const a of stale) {
    void sendPushToUser(a.patientId, {
      title: `No response from ${a.providerType === "NURSE" ? "nurse" : "doctor"}`,
      body: `${a.doctor.name} didn't respond in time.`,
      url: "/patient/appointments",
    });
  }
}
