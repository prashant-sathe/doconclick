import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateWallet } from "@/lib/wallet";
import { netPayable, confirmCouponRedemption } from "@/lib/coupons";
import { sendPushToUser } from "@/lib/firebaseAdmin";

// Shared by create-order (which generates `appt<appointmentId>_<ts>`) and the
// webhook's prefix dispatch.
export const APPOINTMENT_ORDER_PREFIX = "appt";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// Amounts are rupees with paise; anything under half a paisa is float noise.
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

// Records the order before the patient is sent to checkout. Each covered
// appointment's share is snapshotted, so settlement compares what was
// actually charged against what is owed *then* (a coupon may have changed).
export async function recordPaymentOrder({
  orderId,
  patientId,
  appointments,
}: {
  orderId: string;
  patientId: string;
  appointments: { id: string; amount: number; discountAmount: number }[];
}) {
  return prisma.paymentOrder.create({
    data: {
      orderId,
      patientId,
      amount: round2(appointments.reduce((sum, a) => sum + netPayable(a), 0)),
      items: { create: appointments.map((a) => ({ appointmentId: a.id, amount: netPayable(a) })) },
    },
  });
}

export type SettleResult =
  | { outcome: "retry" | "unattributed" }
  | {
      outcome: "settled";
      patientId: string;
      paid: { id: string; doctorId: string; providerType: string; serviceName: string | null; patientName: string }[];
      credited: { amount: number; balance: number; reasons: string[] } | null;
    };

// Settles one successful gateway payment for an appointment order. The single
// path for the webhook and the return page's verify-order fallback, so the
// two can race safely: the order row is claimed atomically, appointments are
// marked PAID only while still SCHEDULED and unpaid, and whatever can't be
// applied goes to the patient's wallet — at most once per payment
// (WalletTransaction.creditOfPaymentId is unique). Money taken is never left
// unaccounted for.
export async function settleAppointmentPayment(payment: {
  orderId: string;
  amount: number; // what the gateway actually charged
  cfPaymentId: string;
  customerId?: string | null; // our patient id, as sent to Cashfree
}): Promise<SettleResult> {
  try {
    return await prisma.$transaction((tx) => settle(tx, payment));
  } catch (err) {
    // Two deliveries adopting the same legacy order both tried to create its
    // PaymentOrder row; the loser re-runs and finds it claimed.
    if (isUniqueViolation(err)) return prisma.$transaction((tx) => settle(tx, payment));
    throw err;
  }
}

async function settle(
  tx: Prisma.TransactionClient,
  { orderId, amount, cfPaymentId, customerId }: Parameters<typeof settleAppointmentPayment>[0]
): Promise<SettleResult> {
  const order =
    (await tx.paymentOrder.findUnique({ where: { orderId }, include: { items: true } })) ??
    (await adoptUnrecordedOrder(tx, { orderId, amount, customerId }));
  if (!order) {
    console.error("Payment for order", orderId, "can't be attributed to a patient — needs manual review");
    return { outcome: "unattributed" };
  }

  const reasons: string[] = [];
  let creditAmount = 0;
  const credit = (amt: number, reason: string) => {
    if (amt <= 0) return;
    creditAmount = round2(creditAmount + amt);
    reasons.push(reason);
  };
  const paidIds: string[] = [];

  const claimed = await tx.paymentOrder.updateMany({
    where: { id: order.id, status: "CREATED" },
    data: { status: "PAID", cfPaymentId, settledAt: new Date() },
  });

  if (claimed.count === 0) {
    const current = await tx.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    if (current.cfPaymentId === cfPaymentId) return { outcome: "retry" };
    // A second successful payment on an order that was already settled.
    credit(amount, `Duplicate payment for order ${orderId}`);
  } else if (!same(amount, order.amount)) {
    // Charged something other than the order was created for — apply none
    // of it automatically; the patient gets every rupee back to spend.
    credit(amount, `Charged ₹${amount} for order ${orderId} created for ₹${order.amount}`);
    await tx.paymentOrderItem.updateMany({ where: { paymentOrderId: order.id }, data: { outcome: "CREDITED" } });
  } else {
    if (order.items.length === 0) credit(amount, `No appointment found for order ${orderId}`);
    for (const item of order.items) {
      const appt = await tx.appointment.findUnique({ where: { id: item.appointmentId } });
      const owed = appt ? netPayable(appt) : 0;
      let applied = false;
      if (!appt) {
        credit(item.amount, `Appointment ${item.appointmentId} no longer exists`);
      } else if (appt.status !== "SCHEDULED") {
        credit(item.amount, `Appointment ${appt.id} was ${appt.status.toLowerCase()} before payment`);
      } else if (appt.paymentStatus === "PAID") {
        credit(item.amount, `Appointment ${appt.id} was already paid`);
      } else if (item.amount + 0.005 < owed) {
        // e.g. a coupon removed after the order was created: what was paid
        // doesn't cover it. Leave it unpaid; the credit can pay it from the wallet.
        credit(item.amount, `Paid ₹${item.amount} for appointment ${appt.id}, which now costs ₹${owed}`);
      } else {
        // Conditional, so a cancel or a wallet payment landing concurrently
        // makes this a no-op (→ credit) instead of a double settlement.
        const marked = await tx.appointment.updateMany({
          where: { id: appt.id, status: "SCHEDULED", paymentStatus: { not: "PAID" } },
          data: { paymentStatus: "PAID", paidAt: appt.paidAt ?? new Date(), cashfreeOrderId: orderId, cashfreePaymentId: cfPaymentId },
        });
        if (marked.count === 1) {
          applied = true;
          paidIds.push(appt.id);
          await confirmCouponRedemption(tx, { appointmentId: appt.id });
          // e.g. a coupon applied after the order was created.
          credit(round2(item.amount - owed), `Overpaid ₹${round2(item.amount - owed)} for appointment ${appt.id}`);
        } else {
          credit(item.amount, `Appointment ${appt.id} changed while the payment was processed`);
        }
      }
      await tx.paymentOrderItem.update({ where: { id: item.id }, data: { outcome: applied ? "APPLIED" : "CREDITED" } });
    }
    await tx.paymentOrder.update({
      where: { id: order.id },
      data: { status: paidIds.length === 0 ? "CREDITED" : creditAmount > 0 ? "PARTIAL" : "PAID" },
    });
  }

  let credited: { amount: number; balance: number; reasons: string[] } | null = null;
  if (creditAmount > 0) {
    const wallet = await getOrCreateWallet(tx, order.patientId);
    const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: creditAmount } } });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "PAYMENT_CREDIT",
        amount: creditAmount,
        balanceAfter: updated.balance,
        status: "SUCCESS",
        cashfreeOrderId: orderId,
        cashfreePaymentId: cfPaymentId,
        creditOfPaymentId: cfPaymentId,
        note: reasons.join("; ").slice(0, 1000),
      },
    });
    credited = { amount: creditAmount, balance: updated.balance, reasons };
  }

  const paid = paidIds.length
    ? await tx.appointment.findMany({
        where: { id: { in: paidIds } },
        select: { id: true, doctorId: true, providerType: true, serviceName: true, patient: { select: { name: true } } },
        orderBy: { scheduledAt: "asc" },
      })
    : [];
  return {
    outcome: "settled",
    patientId: order.patientId,
    paid: paid.map((a) => ({ id: a.id, doctorId: a.doctorId, providerType: a.providerType, serviceName: a.serviceName, patientName: a.patient.name })),
    credited,
  };
}

// Orders created before PaymentOrder existed have no row. Rebuild one from
// what's left: the appointments still carrying the order id, else the
// appointment id embedded in the order id (its cashfreeOrderId may have been
// overwritten by a later retry), else just the patient — so the payment is at
// least credited to their wallet.
async function adoptUnrecordedOrder(
  tx: Prisma.TransactionClient,
  { orderId, amount, customerId }: { orderId: string; amount: number; customerId?: string | null }
) {
  let appointments = await tx.appointment.findMany({ where: { cashfreeOrderId: orderId } });
  let items = appointments.map((a) => ({ appointmentId: a.id, amount: netPayable(a) }));
  if (appointments.length === 0) {
    const embeddedId = /^appt(.+)_\d+$/.exec(orderId)?.[1];
    const appt = embeddedId ? await tx.appointment.findUnique({ where: { id: embeddedId } }) : null;
    if (appt) {
      appointments = [appt];
      // The original amount is unknown; take the gateway's as this visit's
      // share and let the per-item checks decide whether it covers what's owed.
      items = [{ appointmentId: appt.id, amount }];
    }
  }

  const patientId =
    appointments[0]?.patientId ??
    (customerId ? (await tx.user.findFirst({ where: { id: customerId, role: "PATIENT" }, select: { id: true } }))?.id : undefined);
  if (!patientId) return null;

  return tx.paymentOrder.create({
    data: {
      orderId,
      patientId,
      // No appointments at all: the order is just "this patient paid this
      // much" and settles straight to their wallet.
      amount: items.length ? round2(items.reduce((sum, i) => sum + i.amount, 0)) : amount,
      items: { create: items },
    },
    include: { items: true },
  });
}

function isUniqueViolation(err: unknown) {
  return !!err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
}

// Pushes for a settlement. Called after the transaction commits.
export function notifySettlement(result: SettleResult) {
  if (result.outcome !== "settled") return;
  const { paid, credited, patientId } = result;

  if (credited) {
    void sendPushToUser(patientId, {
      title: "Payment credited to wallet",
      body: paid.length > 0
        ? `Part of your payment couldn't be applied, so ₹${credited.amount} was credited to your wallet. New balance ₹${credited.balance}.`
        : `Your payment couldn't be applied to the appointment, so ₹${credited.amount} was credited to your wallet. New balance ₹${credited.balance}.`,
      url: "/patient/wallet",
    });
  }

  const first = paid[0];
  if (first) {
    void sendPushToUser(first.doctorId, {
      title: "Payment received",
      body: first.providerType === "NURSE"
        ? paid.length > 1
          ? `${first.patientName} paid for all ${paid.length} ${first.serviceName ?? "home"} visits.`
          : `${first.patientName} paid for the ${first.serviceName ?? "home"} visit — you can complete it once you're done.`
        : `Payment received for your consultation with ${first.patientName}.`,
      url: first.providerType === "NURSE" ? "/nurse/dashboard" : "/doctor/dashboard",
    });
  }
}
