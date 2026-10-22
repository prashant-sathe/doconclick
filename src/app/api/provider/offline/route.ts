import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveProvider, isProviderRole } from "@/lib/providerGuard";
import { istDayKey, istStartOfDay, istEndOfDay } from "@/lib/istDate";
import { goAway } from "@/lib/timeOffApply";

// POST { offline: true, confirmBookingIds? } — "Go offline now": no new
// bookings for the rest of today (IST), back automatically tomorrow. Today's
// live bookings come back first as 409 AWAY_HAS_BOOKINGS to confirm; then
// they're cancelled + refunded + notified. Visits already under way and
// timed ones already past are kept.
// POST { offline: false } — back online.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || !isProviderRole(authUser.role)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const denied = await requireActiveProvider(authUser);
  if (denied) return denied;

  const { offline, confirmBookingIds } = await req.json().catch(() => ({}));
  if (typeof offline !== "boolean") return NextResponse.json({ error: "Send offline: true or false." }, { status: 400 });

  if (!offline) {
    await prisma.user.update({ where: { id: authUser.id }, data: { offlineUntil: null } });
    return NextResponse.json({ offlineUntil: null });
  }

  const today = istDayKey(new Date());
  const until = istEndOfDay(today);
  const out = await goAway({
    provider: authUser,
    start: istStartOfDay(today),
    end: until,
    confirmBookingIds,
    describe: "not available for the rest of today",
    write: (tx) => tx.user.update({ where: { id: authUser.id }, data: { offlineUntil: until }, select: { offlineUntil: true } }),
  });
  if (out instanceof NextResponse) return out;
  return NextResponse.json({ offlineUntil: out.result.offlineUntil, cancelledBookings: out.cancelled, refundTotal: out.refundTotal, keptInProgress: out.kept });
}
