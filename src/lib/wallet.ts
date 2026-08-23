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
