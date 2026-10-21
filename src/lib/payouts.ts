import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { money, sumMoney } from "@/lib/money";

// What the platform and a provider owe each other for completed, paid,
// not-yet-settled visits (BUG-TRACKER #57) — one calculation for the
// provider's earnings page, their payout request, the admin settle queue,
// the settlement itself and the support assistant:
//   onlinePayoutOwed — online fees the platform collected, minus its commission (owed TO the provider)
//   cashFeeOwed      — the commission on cash the provider collected (owed BY the provider)
//   netAmount        — onlinePayoutOwed − cashFeeOwed; what a settlement pays (negative: the provider owes)

export const UNSETTLED_WHERE = { status: "COMPLETED", paymentStatus: "PAID", settlementId: null } as const;

export type Dues = { cashCount: number; onlineCount: number; cashFeeOwed: number; onlinePayoutOwed: number; netAmount: number };

type Group = { paymentMethod: string; _count: number; _sum: { amount: number | null; platformFee: number | null } };

/** Dues from a groupBy over paymentMethod (one provider's rows). */
export function duesFromGroups(groups: Group[]): Dues {
  let cashCount = 0, onlineCount = 0, cashFeeOwed = 0, onlinePayoutOwed = 0;
  for (const g of groups) {
    if (g.paymentMethod === "CASH") {
      cashCount = g._count;
      cashFeeOwed = money(g._sum.platformFee);
    } else if (g.paymentMethod === "ONLINE") {
      onlineCount = g._count;
      onlinePayoutOwed = sumMoney([g._sum.amount, -(g._sum.platformFee ?? 0)]);
    }
  }
  return { cashCount, onlineCount, cashFeeOwed, onlinePayoutOwed, netAmount: sumMoney([onlinePayoutOwed, -cashFeeOwed]) };
}

/** Dues over the rows matching `where` (e.g. one provider's unsettled visits, or one settlement's). */
export async function duesFor(where: Prisma.AppointmentWhereInput, db: Prisma.TransactionClient = prisma): Promise<Dues> {
  const groups = await db.appointment.groupBy({
    by: ["paymentMethod"],
    where,
    _sum: { amount: true, platformFee: true },
    _count: true,
  });
  return duesFromGroups(groups);
}

/** A provider's current unsettled dues. */
export const unsettledDues = (providerId: string) => duesFor({ ...UNSETTLED_WHERE, doctorId: providerId });
