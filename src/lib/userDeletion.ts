import { prisma } from "@/lib/prisma";

// Soft-deletes a User: blocks login, hides them from all lists, and frees up
// their mobile/email for reuse — without touching any related appointments,
// reviews, messages, or settlements, which must stay intact for the other
// party's history and the payout audit trail.
export async function softDeleteUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const stamp = Date.now();
  return prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      mobile: `deleted_${stamp}_${user.mobile}`,
      email: user.email ? `deleted_${stamp}_${user.email}` : null,
    },
  });
}
