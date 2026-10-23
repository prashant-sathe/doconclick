import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  cancelManyAndRefund, isAlreadyClosed, isTransientConflict,
  needsBookingConfirmation, affectedBookingSummary, BOOKINGS_CHANGED_MESSAGE,
} from "@/lib/appointmentCancel";
import { bookingsDuring, rescheduleRequestsInto } from "@/lib/timeOff";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { formatProviderName } from "@/lib/utils";

export const AWAY_HAS_BOOKINGS_CODE = "AWAY_HAS_BOOKINGS";

/**
 * Shared by time off and "Go offline": the first call answers 409 with the
 * live bookings [start, end] would cancel; the provider confirms by sending
 * exactly those ids back. Then `write` (the time-off row / offline flag) and
 * the cancellations happen in one transaction — each booking refunded to the
 * patient's wallet or its coupon freed (src/lib/appointmentCancel.ts) — and
 * every patient is told. Pending requests to move a visit into the period
 * are declined (the visit keeps its time). A booking that appears in between
 * means asking again, never cancelling something the provider didn't see.
 */
export async function goAway<T>(params: {
  provider: { id: string; name: string; role: string };
  start: Date;
  end: Date;
  confirmBookingIds: unknown;
  /** "on leave 3 Nov – 5 Nov" / "offline today" — for the patient's push. */
  describe: string;
  /** Time off's IST day range, for the patient's (localized) push; absent = "offline today". */
  leave?: { start: Date; end: Date; sameDay: boolean };
  write: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<NextResponse | { result: T; cancelled: number; refundTotal: number; kept: number }> {
  const { provider, start, end, confirmBookingIds, describe, leave, write } = params;
  const { affected, kept } = await bookingsDuring(provider.id, start, end);
  if (needsBookingConfirmation(affected, confirmBookingIds)) {
    return NextResponse.json(
      {
        error: `${affected.length} booking${affected.length === 1 ? "" : "s"} fall${affected.length === 1 ? "s" : ""} in this time. Confirm to cancel and refund ${affected.length === 1 ? "it" : "them"}.`,
        code: AWAY_HAS_BOOKINGS_CODE,
        bookings: affected.map((a) => ({ ...affectedBookingSummary(a), consultType: a.consultType, serviceName: a.serviceName })),
        kept,
      },
      { status: 409 }
    );
  }
  const requests = await rescheduleRequestsInto(provider.id, start, end);

  let out;
  try {
    out = await prisma.$transaction(async (tx) => {
      const result = await write(tx);
      const cancelled = await cancelManyAndRefund(tx, affected.map((a) => a.id), {
        data: { doctorNotes: `Cancelled: provider ${describe}` },
        note: (id) => `Refund for appointment ${id}, cancelled because the provider is ${describe}`,
      });
      // Only the requests still standing (the patient may have withdrawn one).
      const declined = [];
      for (const r of requests) {
        const { count } = await tx.appointment.updateMany({
          where: { id: r.id, status: "SCHEDULED", requestedScheduledAt: { gte: start, lte: end } },
          data: { requestedScheduledAt: null },
        });
        if (count) declined.push(r);
      }
      return { result, cancelled, declined };
    }, { timeout: 30_000 });
  } catch (err) {
    if (!isAlreadyClosed(err) && !isTransientConflict(err)) throw err;
    return NextResponse.json({ error: BOOKINGS_CHANGED_MESSAGE }, { status: 409 });
  }

  const name = formatProviderName(provider.name, provider.role === "NURSE" ? "NURSE" : "DOCTOR");
  // {away} reads "on leave 3 Nov – 5 Nov" / "not available for the rest of today".
  const awayValues = {
    provider: name,
    away: leave ? "LEAVE" : "OFFLINE",
    from: leave?.start ?? start,
    to: leave?.end ?? end,
    sameDay: leave?.sameDay ? "yes" : "no",
  };
  for (const { cancelled, refund } of out.cancelled) {
    void sendPushToUser(cancelled.patientId, {
      key: "apptCancelledProviderAway",
      values: {
        ...awayValues,
        hasService: cancelled.serviceName ? "yes" : "no",
        service: cancelled.serviceName ?? "",
        when: cancelled.scheduledAt,
        refunded: refund > 0 ? "yes" : "no",
        amount: refund,
      },
      url: "/patient/appointments",
    });
  }
  for (const r of out.declined) {
    void sendPushToUser(r.patientId, {
      key: "rescheduleDeclinedProviderAway",
      values: { ...awayValues, when: r.scheduledAt },
      url: "/patient/appointments",
    });
  }
  return {
    result: out.result,
    cancelled: out.cancelled.length,
    refundTotal: out.cancelled.reduce((sum, c) => sum + c.refund, 0),
    kept,
  };
}
