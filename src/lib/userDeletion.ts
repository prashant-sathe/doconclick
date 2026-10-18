import { prisma } from "@/lib/prisma";
import { revokeSessions } from "@/lib/auth";

// Soft-deletes a User: blocks login, hides them from all lists, and frees up
// their mobile/email for reuse — without touching any related appointments,
// reviews, messages, or settlements, which must stay intact for the other
// party's history and the payout audit trail.
//
// Only acts on a live account of the given role — returns null for a wrong
// role (so e.g. the patients route can't remove an admin and bypass the
// last-admin guard), an unknown id, or an already deleted user.
export async function softDeleteUser(userId: string, role: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, role, deletedAt: null } });
  if (!user) return null;

  const stamp = Date.now();
  // Conditional on still being live, so two concurrent deletes can't both
  // run (the second would re-prefix the already-prefixed mobile/email).
  const claimed = await prisma.user.updateMany({
    where: { id: userId, role, deletedAt: null },
    data: {
      deletedAt: new Date(),
      mobile: `deleted_${stamp}_${user.mobile}`,
      email: user.email ? `deleted_${stamp}_${user.email}` : null,
    },
  });
  if (claimed.count === 0) return null;
  const deleted = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // deletedAt alone already fails verifySession, but this also evicts the
  // cached session state so the user is signed out immediately.
  await revokeSessions(userId);
  return deleted;
}
