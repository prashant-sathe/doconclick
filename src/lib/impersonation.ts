import { prisma } from "@/lib/prisma";

/**
 * Closes the admin's open ImpersonationLog rows (endedAt) — for one target,
 * or all of them. Called on "exit impersonation" and when the impersonated
 * session is simply logged out, so the audit log never shows a session that
 * "never ended". Returns how many were closed.
 */
export async function endImpersonation(adminId: string, targetUserId?: string): Promise<number> {
  const { count } = await prisma.impersonationLog.updateMany({
    where: { adminId, endedAt: null, ...(targetUserId ? { targetUserId } : {}) },
    data: { endedAt: new Date() },
  });
  return count;
}
