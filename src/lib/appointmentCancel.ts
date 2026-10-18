import { Prisma } from "@/generated/prisma/client";
import { refundAppointmentToWallet } from "@/lib/wallet";
import { netPayable, releaseCouponRedemption } from "@/lib/coupons";

// Thrown inside a cancel/decline transaction when a concurrent request has
// already moved the appointment on — rolls the whole transaction back.
export class AppointmentAlreadyClosedError extends Error {}
export const ALREADY_CLOSED_MESSAGE = "This appointment was already cancelled or updated. Please refresh.";

export const LIVE_STATUSES = ["PENDING_APPROVAL", "SCHEDULED"];

export function isAlreadyClosed(err: unknown) {
  return err instanceof AppointmentAlreadyClosedError
    || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002");
}

// A conditional status change that only succeeds for one of several racing
// requests; the losers abort before touching the wallet.
export async function claimStatusChange(
  tx: Prisma.TransactionClient,
  id: string,
  fromStatuses: string[],
  data: Prisma.AppointmentUpdateManyMutationInput
) {
  const { count } = await tx.appointment.updateMany({
    where: { id, status: { in: fromStatuses } },
    data,
  });
  if (count === 0) throw new AppointmentAlreadyClosedError();
  return tx.appointment.findUniqueOrThrow({ where: { id } });
}

type CancelOptions = {
  data?: Prisma.AppointmentUpdateManyMutationInput;
  refundType?: "CANCELLATION_REFUND" | "REASSIGNMENT_CREDIT";
};

// Settles the money on an appointment just claimed as CANCELLED: a paid one
// is refunded to the patient's wallet (the coupon-discounted amount they
// actually paid), an unpaid one frees the coupon slot it had reserved. The
// row must have been read after the claim — a payment may have landed since
// any earlier snapshot.
async function settleCancelled(
  tx: Prisma.TransactionClient,
  cancelled: Prisma.AppointmentGetPayload<object>,
  refundType: NonNullable<CancelOptions["refundType"]>,
  note: string
) {
  const wasPaid = cancelled.paymentStatus === "PAID";
  const refund = wasPaid ? netPayable(cancelled) : 0;
  if (wasPaid) {
    await refundAppointmentToWallet(tx, {
      patientId: cancelled.patientId,
      appointmentId: cancelled.id,
      amount: refund,
      type: refundType,
      note,
    });
  } else {
    await releaseCouponRedemption(tx, { appointmentId: cancelled.id });
  }
  return { cancelled, wasPaid, refund };
}

const cancelData = (data: Prisma.AppointmentUpdateManyMutationInput = {}) =>
  ({ ...data, status: "CANCELLED", requestedScheduledAt: null });

// Cancels one live appointment and settles its money — the path every
// single cancel uses (doctor, patient). Throws AppointmentAlreadyClosedError
// if it's no longer live.
export async function cancelAndRefund(
  tx: Prisma.TransactionClient,
  id: string,
  { data, refundType = "CANCELLATION_REFUND", note }: CancelOptions & { note: string }
) {
  const cancelled = await claimStatusChange(tx, id, LIVE_STATUSES, cancelData(data));
  return settleCancelled(tx, cancelled, refundType, note);
}

// The same for several appointments in one transaction (clinic leave,
// account deletion). Every row is claimed first, in id order, before any
// wallet is touched: a concurrent single cancel locks appointment → wallet,
// so holding a wallet while waiting on another appointment would deadlock.
// A row that's no longer live throws AppointmentAlreadyClosedError, or is
// skipped with `skipClosed`.
export async function cancelManyAndRefund(
  tx: Prisma.TransactionClient,
  ids: string[],
  { data, refundType = "CANCELLATION_REFUND", note, skipClosed = false }:
    CancelOptions & { note: (id: string) => string; skipClosed?: boolean }
) {
  const claimed: string[] = [];
  for (const id of [...ids].sort()) {
    const { count } = await tx.appointment.updateMany({
      where: { id, status: { in: LIVE_STATUSES } },
      data: cancelData(data),
    });
    if (count === 0) {
      if (skipClosed) continue;
      throw new AppointmentAlreadyClosedError();
    }
    claimed.push(id);
  }
  const rows = await tx.appointment.findMany({ where: { id: { in: claimed } }, orderBy: { id: "asc" } });
  const results = [];
  for (const row of rows) results.push(await settleCancelled(tx, row, refundType, note(row.id)));
  return results;
}

// Postgres gave up on the transaction because of a concurrent one (deadlock
// or serialization failure) — nothing was written; safe to report as "this
// changed, try again".
export function isTransientConflict(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError
    && (err.code === "P2034" || /\b(40P01|40001)\b/.test(err.message));
}

// ── Confirm-before-cancel (clinic leave, clinic delete/deactivate) ──
// The first request returns the live bookings it would cancel; the doctor
// confirms by sending back exactly those ids. Any booking not in that list —
// one made after the doctor looked — means asking again, never cancelling
// something unseen.

type AffectedRow = {
  id: string;
  patientName: string | null;
  patient: { name: string };
  scheduledAt: Date;
  status: string;
  paymentStatus: string;
  amount: number;
  discountAmount: number;
};

export function needsBookingConfirmation(affected: { id: string }[], confirmBookingIds: unknown) {
  const confirmed = new Set(Array.isArray(confirmBookingIds) ? confirmBookingIds : []);
  return affected.some((a) => !confirmed.has(a.id));
}

// What the confirmation dialog lists for each booking.
export function affectedBookingSummary(a: AffectedRow) {
  return {
    id: a.id,
    patientName: a.patientName ?? a.patient.name,
    scheduledAt: a.scheduledAt,
    status: a.status,
    paid: a.paymentStatus === "PAID",
    refund: a.paymentStatus === "PAID" ? netPayable(a) : 0,
  };
}

export const BOOKINGS_CHANGED_MESSAGE = "A booking just changed. Please review the latest list and confirm again.";
