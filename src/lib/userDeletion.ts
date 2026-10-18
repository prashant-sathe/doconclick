import { prisma } from "@/lib/prisma";
import { revokeSessions } from "@/lib/auth";

// Soft-deletes a User: blocks login, hides them from all lists, and frees up
// their mobile/email for reuse — without touching any related appointments,
// reviews, messages, or settlements, which must stay intact for the other
// party's history and the payout audit trail.
export async function softDeleteUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const stamp = Date.now();
  const deleted = await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      mobile: `deleted_${stamp}_${user.mobile}`,
      email: user.email ? `deleted_${stamp}_${user.email}` : null,
    },
  });
  // deletedAt alone already fails verifySession, but this also evicts the
  // cached session state so the user is signed out immediately.
  await revokeSessions(userId);
  return deleted;
}
