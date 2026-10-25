import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Shared with the webhook handler's orderId-prefix dispatch — keep in one
// place so create-order and the webhook branch never drift apart.
export const WALLET_TOPUP_ORDER_PREFIX = "wallettopup";
export const MIN_TOPUP_AMOUNT = 100;
export const MAX_TOPUP_AMOUNT = 25000;

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export async function getOrCreateWallet(client: PrismaClientOrTx, userId: string) {
  return client.wallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

// Credits a cancelled/declined appointment's payment back to the patient's
// wallet. refundOfAppointmentId is unique, so a second refund for the same
// appointment fails the surrounding transaction instead of paying out twice.
export async function refundAppointmentToWallet(
  tx: Prisma.TransactionClient,
  { patientId, appointmentId, amount, type, note, adminId }: {
    patientId: string;
    appointmentId: string;
    amount: number;
    type: "CANCELLATION_REFUND" | "REASSIGNMENT_CREDIT";
    note: string;
    adminId?: string; // the admin who cancelled it from /admin/bookings
  }
) {
  const wallet = await getOrCreateWallet(tx, patientId);
  const updatedWallet = await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: amount } },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type,
      amount,
      balanceAfter: updatedWallet.balance,
      status: "SUCCESS",
      refundOfAppointmentId: appointmentId,
      note,
      adminId,
    },
  });
  return updatedWallet;
}
