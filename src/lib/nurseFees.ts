import { prisma } from "@/lib/prisma";

// The admin-set nurse fees (₹0 = that step doesn't exist) — read by the fee
// checkout and the coupon preview so both price the same fee.
export async function getNurseFees(): Promise<{ registrationFee: number; subscriptionFee: number }> {
  const s = await prisma.platformSettings.findFirst({ select: { nurseRegistrationFee: true, nurseSubscriptionFee: true } });
  return { registrationFee: s?.nurseRegistrationFee ?? 0, subscriptionFee: s?.nurseSubscriptionFee ?? 0 };
}
