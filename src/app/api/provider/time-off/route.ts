import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveProvider, isProviderRole } from "@/lib/providerGuard";
import { istDayKey } from "@/lib/istDate";
import { parseRange, rangeLabel, TIME_OFF_REASON_MAX } from "@/lib/timeOff";
import { goAway } from "@/lib/timeOffApply";

// GET: the provider's current and upcoming time off, and whether they're offline.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || !isProviderRole(authUser.role)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const [timeOff, user] = await Promise.all([
    prisma.providerTimeOff.findMany({
      where: { providerId: authUser.id, endDate: { gte: istDayKey(new Date()) } },
      orderBy: { startDate: "asc" },
    }),
    prisma.user.findUnique({ where: { id: authUser.id }, select: { offlineUntil: true } }),
  ]);
  const offlineUntil = user?.offlineUntil && user.offlineUntil.getTime() > Date.now() ? user.offlineUntil : null;
  return NextResponse.json({ timeOff, offlineUntil });
}

// POST { startDate, endDate?, reason?, confirmBookingIds? }: time off over a
// range of IST days — every clinic, video and home visit. Bookings already in
// the range come back first as 409 AWAY_HAS_BOOKINGS for the provider to
// confirm; confirming adds it and cancels + refunds + notifies them.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || !isProviderRole(authUser.role)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  // Suspension only — taking time off (and so refunding patients) needs no plan.
  const denied = await requireActiveProvider(authUser);
  if (denied) return denied;

  const { startDate, endDate, reason: rawReason, confirmBookingIds } = await req.json().catch(() => ({}));
  const range = parseRange(startDate, endDate);
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });
  const reason = typeof rawReason === "string" && rawReason.trim() ? rawReason.trim() : null;
  if (reason && reason.length > TIME_OFF_REASON_MAX) {
    return NextResponse.json({ error: `Keep the reason under ${TIME_OFF_REASON_MAX} characters.` }, { status: 400 });
  }

  const overlap = await prisma.providerTimeOff.findFirst({
    where: { providerId: authUser.id, startDate: { lte: range.endDate }, endDate: { gte: range.startDate } },
  });
  if (overlap) {
    return NextResponse.json({ error: `This overlaps your time off ${rangeLabel(overlap.startDate, overlap.endDate)}. Remove that one first, or pick other dates.` }, { status: 409 });
  }

  const out = await goAway({
    provider: authUser,
    start: range.start,
    end: range.end,
    confirmBookingIds,
    describe: `on leave ${rangeLabel(range.startDate, range.endDate)}`,
    leave: { start: range.start, end: range.end, sameDay: range.startDate === range.endDate },
    write: (tx) => tx.providerTimeOff.create({ data: { providerId: authUser.id, startDate: range.startDate, endDate: range.endDate, reason } }),
  });
  if (out instanceof NextResponse) return out;
  return NextResponse.json({ ...out.result, cancelledBookings: out.cancelled, refundTotal: out.refundTotal, keptInProgress: out.kept });
}
