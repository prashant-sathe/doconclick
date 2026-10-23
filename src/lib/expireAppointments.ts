import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { netPayable, releaseCouponRedemption } from "@/lib/coupons";
import { refundAppointmentToWallet } from "@/lib/wallet";
import { Prisma } from "@/generated/prisma/client";

export const APPOINTMENT_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

// Auto-expires appointment requests the doctor never responded to within
// the timeout window. Called lazily from read/write routes rather than a
// background job — cheap no-op when nothing is stale.
export async function expireStalePendingRequests() {
  await lapseStaleRescheduleRequests();
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
        select: { id: true, packageId: true },
      })
    : [];
  const siblingPackage = new Map(siblings.map((a) => [a.id, a.packageId]));
  const candidates = [...stale.map((a) => a.id), ...siblings.map((a) => a.id)];

  // Each row is claimed in its own transaction: this runs lazily from several
  // routes at once, and the provider may be accepting at this very moment —
  // only the request whose conditional update wins may expire (and refund) it.
  // A PAID row here is an accepted, paid appointment the patient rescheduled
  // (back to PENDING_APPROVAL) that the provider never re-confirmed; its money
  // goes back to the wallet. refundOfAppointmentId keeps that idempotent.
  const refundedById = new Map<string, number>();
  const expiredIds = new Set<string>();
  for (const id of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.appointment.updateMany({
          where: { id, status: "PENDING_APPROVAL" },
          data: { status: "EXPIRED" },
        });
        if (count === 0) return;
        expiredIds.add(id);
        const appt = await tx.appointment.findUniqueOrThrow({
          where: { id },
          select: { patientId: true, paymentStatus: true, amount: true, discountAmount: true },
        });
        if (appt.paymentStatus === "PAID") {
          const amount = netPayable(appt);
          if (amount > 0) {
            await refundAppointmentToWallet(tx, {
              patientId: appt.patientId,
              appointmentId: id,
              amount,
              type: "CANCELLATION_REFUND",
              note: `Refund for appointment ${id}, expired — the new time was never confirmed`,
            });
            refundedById.set(id, amount);
          }
        } else {
          // Free any coupon slot that was reserved but never paid for.
          await releaseCouponRedemption(tx, { appointmentId: id });
        }
      });
    } catch (err) {
      // Already refunded by a concurrent run (unique refund key) — that run
      // owns the expiry and the notification.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }

  for (const a of stale) {
    if (!expiredIds.has(a.id)) continue;
    // A package's sibling visits expire (and refund) along with this one.
    const refunded = [...refundedById].reduce(
      (sum, [id, amt]) => (id === a.id || (a.packageId && siblingPackage.get(id) === a.packageId) ? sum + amt : sum),
      0,
    );
    void sendPushToUser(a.patientId, {
      key: "apptExpired",
      values: {
        providerType: a.providerType,
        doctor: a.doctor.name,
        refunded: refunded > 0 ? "yes" : "no",
        amount: Math.round(refunded * 100) / 100,
      },
      url: refunded > 0 ? "/patient/wallet" : "/patient/appointments",
    });
  }
}

// A patient's request to move an accepted appointment lapses once either the
// requested or the original time has passed unanswered — the booking simply
// stays at its original time. Conditional per row so concurrent sweeps (and a
// provider answering right now) never notify twice.
async function lapseStaleRescheduleRequests() {
  const now = new Date();
  const stale = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      requestedScheduledAt: { not: null },
      OR: [{ requestedScheduledAt: { lt: now } }, { scheduledAt: { lt: now } }],
    },
    select: { id: true, patientId: true, scheduledAt: true, requestedScheduledAt: true, doctor: { select: { name: true } } },
  });
  for (const a of stale) {
    const { count } = await prisma.appointment.updateMany({
      where: { id: a.id, status: "SCHEDULED", requestedScheduledAt: a.requestedScheduledAt },
      data: { requestedScheduledAt: null },
    });
    if (count === 0) continue;
    void sendPushToUser(a.patientId, {
      key: "rescheduleExpired",
      values: { doctor: a.doctor.name, when: a.scheduledAt },
      url: "/patient/appointments",
    });
  }
}
