import type { Prisma } from "@/generated/prisma/client";

// When an appointment's money came in, for revenue reports. Every path that
// marks an appointment PAID now sets paidAt (Cashfree settlement, wallet pay,
// CASH on completion); older rows may still have none — for those the visit
// time stands in (see prisma/backfill-paid-at.ts to fill them for good).

type Range = { gte?: Date; lte?: Date };

// Where-clause: paid inside the range, by paidAt or — when that's missing —
// by the visit time. Spread into a where that has no other OR.
export function paidInRange(range: Range): Prisma.AppointmentWhereInput {
  return { OR: [{ paidAt: range }, { paidAt: null, scheduledAt: range }] };
}

export function effectivePaidAt(a: { paidAt: Date | null; scheduledAt: Date }): Date {
  return a.paidAt ?? a.scheduledAt;
}
