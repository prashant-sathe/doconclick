import { prisma } from "@/lib/prisma";

export const APPOINTMENT_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

// Auto-expires appointment requests the doctor never responded to within
// the timeout window. Called lazily from read/write routes rather than a
// background job — cheap no-op when nothing is stale.
export async function expireStalePendingRequests() {
  const cutoff = new Date(Date.now() - APPOINTMENT_REQUEST_TIMEOUT_MS);
  await prisma.appointment.updateMany({
    where: { status: "PENDING_APPROVAL", createdAt: { lt: cutoff } },
    data: { status: "EXPIRED" },
  });
}
