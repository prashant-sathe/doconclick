// One-off: fills Appointment.paidAt on PAID appointments that don't have one
// (BUG-TRACKER #23 — CASH completions never set it, and some older online
// payments didn't either), so revenue reports can filter by payment date.
//
// Where the time comes from, best first:
//   1. ORDER   — the Cashfree order that applied the payment (PaymentOrder.settledAt)
//   2. WALLET  — the wallet payment for it (WalletTransaction BOOKING_PAYMENT)
//   3. VISIT   — no payment record (CASH, or legacy online): the visit time
//                (scheduledAt, never later than now). No completion
//                timestamp is stored, so this is the closest stand-in.
//
// Dry run by default — prints what it would set and changes nothing:
//   npx tsx prisma/backfill-paid-at.ts
// Then, to write (only rows still missing paidAt are touched; safe to re-run):
//   npx tsx prisma/backfill-paid-at.ts --apply
// Limit to specific appointments (e.g. for a test):
//   npx tsx prisma/backfill-paid-at.ts --only-ids=id1,id2 [--apply]
try {
  process.loadEnvFile();
} catch {
  // no .env file present — assume env vars are already set (e.g. in the container)
}

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://doconclick:doconclick_secret@localhost:5433/doconclick_db";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const apply = process.argv.includes("--apply");
const onlyIdsArg = process.argv.find((a) => a.startsWith("--only-ids="));
const onlyIds = onlyIdsArg ? onlyIdsArg.slice("--only-ids=".length).split(",").filter(Boolean) : null;

type Source = "ORDER" | "WALLET" | "VISIT";

async function main() {
  const db = new URL(connectionString);
  console.log(`Database: ${db.hostname}:${db.port}${db.pathname}  ·  mode: ${apply ? "APPLY (writing)" : "dry run (no changes)"}`
    + (onlyIds ? `  ·  only ${onlyIds.length} id(s)` : ""));

  const rows = await prisma.appointment.findMany({
    where: { paymentStatus: "PAID", paidAt: null, ...(onlyIds ? { id: { in: onlyIds } } : {}) },
    select: {
      id: true, paymentMethod: true, status: true, scheduledAt: true,
      paymentOrderItems: { select: { outcome: true, paymentOrder: { select: { status: true, settledAt: true } } } },
      walletTransaction: { select: { type: true, status: true, createdAt: true } },
    },
  });

  const now = new Date();
  const plan = rows.map((a) => {
    const orderTimes = a.paymentOrderItems
      .filter((i) => i.outcome !== "CREDITED" && i.paymentOrder.settledAt && ["PAID", "PARTIAL"].includes(i.paymentOrder.status))
      .map((i) => i.paymentOrder.settledAt!.getTime());
    const wallet = a.walletTransaction?.type === "BOOKING_PAYMENT" && a.walletTransaction.status === "SUCCESS" ? a.walletTransaction.createdAt : null;
    let source: Source;
    let paidAt: Date;
    if (orderTimes.length) {
      source = "ORDER";
      paidAt = new Date(Math.min(...orderTimes));
    } else if (wallet) {
      source = "WALLET";
      paidAt = wallet;
    } else {
      source = "VISIT";
      paidAt = a.scheduledAt.getTime() > now.getTime() ? now : a.scheduledAt;
    }
    return { id: a.id, paymentMethod: a.paymentMethod, status: a.status, source, paidAt };
  });

  const bySource = (s: Source) => plan.filter((p) => p.source === s).length;
  console.log(`PAID appointments without paidAt: ${plan.length}  (ORDER ${bySource("ORDER")}, WALLET ${bySource("WALLET")}, VISIT ${bySource("VISIT")})`);
  for (const p of plan.slice(0, 20)) {
    console.log(`  ${p.id}  ${p.paymentMethod.padEnd(6)} ${p.status.padEnd(16)} ${p.source.padEnd(6)} → ${p.paidAt.toISOString()}`);
  }
  if (plan.length > 20) console.log(`  … and ${plan.length - 20} more`);

  if (!apply) {
    console.log("\nDry run — nothing changed. Re-run with --apply to write these.");
    return;
  }

  let written = 0;
  for (const p of plan) {
    // Conditional, so a paidAt set meanwhile (or by an earlier run) is kept.
    const { count } = await prisma.appointment.updateMany({ where: { id: p.id, paidAt: null }, data: { paidAt: p.paidAt } });
    written += count;
  }
  console.log(`\nWrote paidAt on ${written} appointment(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
