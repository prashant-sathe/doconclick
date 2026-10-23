import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { readJson } from "@/lib/routeGuards";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { getOrCreateWallet } from "@/lib/wallet";
import { MAX_ADMIN_ADJUSTMENT, ADJUSTMENT_REASON_MIN, ADJUSTMENT_REASON_MAX } from "@/lib/walletLimits";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

class NeedsAcknowledgement extends Error {
  constructor(public currentBalance: number, public resultingBalance: number) {
    super("NEEDS_ACKNOWLEDGEMENT");
  }
}

// POST: admin credits or debits a patient's wallet. A debit that would push
// the balance negative requires an explicit acknowledgement — same
// requiresAcknowledgement/409 pattern as /api/admin/finance/settlements.
export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const { userId } = await params;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const { direction, note, acknowledgeNegative } = body;

  if (direction !== "CREDIT" && direction !== "DEBIT") {
    return NextResponse.json({ error: "Choose credit or debit." }, { status: 400 });
  }
  if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
    return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  }
  // Whole paise only — ₹0.001 would be a ledger row that moves nothing.
  const amount = round2(body.amount);
  if (amount < 0.01) {
    return NextResponse.json({ error: "The smallest adjustment is ₹0.01." }, { status: 400 });
  }
  if (amount > MAX_ADMIN_ADJUSTMENT) {
    return NextResponse.json(
      { error: `One adjustment can be at most ₹${MAX_ADMIN_ADJUSTMENT.toLocaleString("en-IN")}. Split it if more is really needed.` },
      { status: 400 }
    );
  }
  // The reason is kept on the ledger row (and shown to the patient), so it has to say something.
  const reason = typeof note === "string" ? note.trim() : "";
  if (reason.length < ADJUSTMENT_REASON_MIN) {
    return NextResponse.json({ error: `Add a reason (at least ${ADJUSTMENT_REASON_MIN} characters) — it's recorded on the wallet history.` }, { status: 400 });
  }
  if (reason.length > ADJUSTMENT_REASON_MAX) {
    return NextResponse.json({ error: `Keep the reason under ${ADJUSTMENT_REASON_MAX} characters.` }, { status: 400 });
  }

  // Wallets belong to patients — providers are paid out through settlements,
  // and admins have no wallet to adjust.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, deletedAt: true } });
  if (!user || user.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "PATIENT") {
    return NextResponse.json({ error: "Wallet adjustments are only for patient accounts." }, { status: 400 });
  }

  let result: { balance: number; transaction: unknown };
  try {
    result = await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx, userId);

      if (direction === "CREDIT") {
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
      } else if (acknowledgeNegative === true) {
        // The admin has seen it will go negative and chose to proceed.
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } });
      } else {
        // Conditional in the database, not read-then-write: two debits racing
        // can't both pass a balance check that only one of them satisfies.
        const debited = await tx.wallet.updateMany({
          where: { id: wallet.id, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });
        if (debited.count === 0) {
          const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } });
          throw new NeedsAcknowledgement(current.balance, round2(current.balance - amount));
        }
      }

      const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: direction === "CREDIT" ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
          amount,
          balanceAfter: updated.balance,
          status: "SUCCESS",
          adminId: authUser.id,
          note: reason,
        },
      });
      return { balance: updated.balance, transaction };
    });
  } catch (err) {
    if (err instanceof NeedsAcknowledgement) {
      return NextResponse.json(
        { requiresAcknowledgement: true, currentBalance: err.currentBalance, resultingBalance: err.resultingBalance },
        { status: 409 }
      );
    }
    throw err;
  }

  // The reason is an internal note as much as a patient-facing one — the push
  // says what happened and where to read the detail, not the admin's wording.
  void sendPushToUser(userId, {
    key: direction === "CREDIT" ? "walletAdminCredited" : "walletAdminDebited",
    values: { amount, balance: result.balance },
    url: "/patient/wallet",
  });

  return NextResponse.json(result);
}
