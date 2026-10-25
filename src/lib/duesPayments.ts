import { prisma } from "@/lib/prisma";
import { UNSETTLED_WHERE, duesFor, unsettledDues, type Dues } from "@/lib/payouts";
import { money } from "@/lib/money";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { initialSettlementStatus } from "@/lib/settlementPayout";

// A doctor paying the platform the commission they owe on cash visits (net
// of their online earnings — src/lib/payouts.ts) through Cashfree, and the
// limit on how much they may owe before cash bookings from their side stop.

export const DUES_ORDER_PREFIX = "docdue";
export const DEFAULT_CASH_DUE_LIMIT = 2000;
export const CASH_DUE_LIMIT_MAX = 1_000_000;
export const CASH_DUE_LIMIT_CODE = "CASH_DUE_LIMIT";

/** What the doctor owes the platform right now (0 when the platform owes them). */
export function owedByDoctor(dues: Dues): number {
  return dues.netAmount < 0 ? money(-dues.netAmount) : 0;
}

/** The admin-set limit; 0 = no limit. */
export async function getCashDueLimit(): Promise<number> {
  const s = await prisma.platformSettings.findFirst({ select: { cashDueLimit: true } });
  const v = s?.cashDueLimit;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : DEFAULT_CASH_DUE_LIMIT;
}

/**
 * Why a new cash booking from the doctor's side (walk-in, or switching one to
 * cash) is refused, or null. Online bookings are never blocked — their money
 * reaches the platform first.
 */
export async function cashDueProblem(doctorId: string, viewer: "doctor" | "staff"): Promise<{ message: string; owed: number; limit: number } | null> {
  const limit = await getCashDueLimit();
  if (limit <= 0) return null;
  const owed = owedByDoctor(await unsettledDues(doctorId));
  if (owed < limit) return null;
  const amount = `₹${owed.toLocaleString("en-IN")}`;
  return {
    owed,
    limit,
    message: viewer === "staff"
      ? `The doctor owes DocOnClick ${amount} in platform fees on cash visits, so cash bookings are paused until they pay it (Earnings → Pay now). You can still book with online payment.`
      : `You owe DocOnClick ${amount} in platform fees on cash visits (limit ₹${limit.toLocaleString("en-IN")}). Pay it from Earnings to take cash bookings again — online bookings still work.`,
  };
}

export type DuesSettleResult =
  | { outcome: "settled"; doctorId: string; settlementId: string; amount: number }
  | { outcome: "retry" | "unknown" }
  | { outcome: "review"; doctorId: string; reason: string };

/**
 * Applies a successful gateway payment for a dues order — the single path
 * for the webhook and the earnings page's verify fallback, safe to race and
 * to retry. The order row is claimed once (CREATED → PAID); then the visits
 * snapshotted at checkout are settled together, but only if every one of
 * them is still unsettled and they still add up to what was charged.
 * Otherwise nothing is applied and the payment waits for the admin
 * (PAID, no settlement) — money taken is never matched to the wrong visits.
 */
export async function settleDuesPayment(payment: { orderId: string; amount: number; cfPaymentId: string }): Promise<DuesSettleResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.duesPayment.findUnique({ where: { orderId: payment.orderId } });
    if (!order) return { outcome: "unknown" as const };

    const claimed = await tx.duesPayment.updateMany({
      where: { id: order.id, status: { in: ["CREATED", "FAILED"] } },
      data: { status: "PAID", cfPaymentId: payment.cfPaymentId, paidAt: new Date() },
    });
    if (claimed.count === 0) return { outcome: "retry" as const };

    const review = (reason: string) => {
      console.error("Dues payment", payment.orderId, "needs admin review:", reason);
      return { outcome: "review" as const, doctorId: order.doctorId, reason };
    };
    if (Math.abs(payment.amount - order.amount) >= 0.005) {
      return review(`charged ₹${payment.amount}, order was for ₹${order.amount}`);
    }

    const ids: string[] = JSON.parse(order.appointmentIds);
    const covered = { id: { in: ids }, doctorId: order.doctorId, ...UNSETTLED_WHERE };
    const still = await tx.appointment.count({ where: covered });
    if (still !== ids.length) return review(`${ids.length - still} of ${ids.length} visits were settled another way`);
    const totals = await duesFor(covered, tx);
    if (Math.abs(owedByDoctor(totals) - order.amount) >= 0.005) {
      return review(`the visits now come to ₹${owedByDoctor(totals)}, not ₹${order.amount}`);
    }

    const settlement = await tx.settlement.create({
      // Net ≤ 0 (the doctor paid us), so NO_PAYOUT — nothing for the platform to send.
      data: { doctorId: order.doctorId, ...totals, status: initialSettlementStatus(totals.netAmount), note: `Paid by the doctor via Cashfree (payment ${payment.cfPaymentId})` },
    });
    const moved = await tx.appointment.updateMany({ where: covered, data: { settlementId: settlement.id } });
    // An admin settlement claimed some of these at this very moment: roll
    // back and let the retry route it to review.
    if (moved.count !== ids.length) throw new Error(`Dues payment ${payment.orderId}: lost a race claiming its visits`);
    await tx.duesPayment.update({ where: { id: order.id }, data: { settlementId: settlement.id } });
    return { outcome: "settled" as const, doctorId: order.doctorId, settlementId: settlement.id, amount: order.amount };
  });
}

export function notifyDuesSettled(result: DuesSettleResult) {
  if (result.outcome === "settled") {
    void sendPushToUser(result.doctorId, {
      key: "duesPaid",
      values: { amount: result.amount },
      url: "/doctor/earnings",
    });
  } else if (result.outcome === "review") {
    void sendPushToUser(result.doctorId, {
      key: "duesNeedsReview",
      url: "/doctor/earnings",
    });
  }
}
