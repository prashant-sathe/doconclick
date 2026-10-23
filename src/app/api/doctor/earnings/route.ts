import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { sumMoney } from "@/lib/money";
import { istDayKey, istMonthKey, shiftMonthKey, istStartOfMonth, istStartOfDay, addDaysYmd, mondayIndex } from "@/lib/istDate";
import { withErrorLocale } from "@/lib/apiErrors";

const PAGE = 10;
const MAX_SKIP = 100_000;

// GET: the doctor's own earnings in a lean shape — totals by IST month via
// aggregate, this week's per-day figures, and one page of the transaction
// list (?skip=N). Replaces loading every appointment (with vitals, meds,
// attachments…) just to add up a few numbers.
export const GET = withErrorLocale(async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const denied = await requireActiveDoctor(authUser, { requireSubscription: true });
  if (denied) return denied;

  const skipRaw = Number(new URL(req.url).searchParams.get("skip") ?? 0);
  const skip = Number.isInteger(skipRaw) && skipRaw >= 0 && skipRaw <= MAX_SKIP ? skipRaw : 0;

  const base = { doctorId: authUser.id, status: "COMPLETED", paymentStatus: "PAID" };
  const now = new Date();
  const thisMonthKey = istMonthKey(now);
  const thisMonthStart = istStartOfMonth(thisMonthKey);
  const lastMonthStart = istStartOfMonth(shiftMonthKey(thisMonthKey, -1));
  const todayKey = istDayKey(now);
  const weekStartKey = addDaysYmd(todayKey, -mondayIndex(todayKey));
  const weekStart = istStartOfDay(weekStartKey);

  const sums = (where: object) =>
    prisma.appointment.aggregate({ where: { ...base, ...where }, _sum: { amount: true, platformFee: true } });
  const net = (r: Awaited<ReturnType<typeof sums>>) => sumMoney([r._sum.amount ?? 0, -(r._sum.platformFee ?? 0)]);

  const [all, thisMonth, lastMonth, weekRows, page] = await Promise.all([
    sums({}),
    sums({ scheduledAt: { gte: thisMonthStart } }),
    sums({ scheduledAt: { gte: lastMonthStart, lt: thisMonthStart } }),
    prisma.appointment.findMany({
      where: { ...base, scheduledAt: { gte: weekStart } },
      select: { amount: true, platformFee: true, scheduledAt: true },
    }),
    prisma.appointment.findMany({
      where: base,
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      skip,
      take: PAGE + 1,
      select: {
        id: true, amount: true, platformFee: true, consultType: true, paymentMethod: true, scheduledAt: true,
        patientName: true, relation: true, patient: { select: { name: true } },
      },
    }),
  ]);

  const days = [...Array(7)].map((_, i) => {
    const key = addDaysYmd(weekStartKey, i);
    const value = sumMoney(weekRows.filter((a) => istDayKey(a.scheduledAt) === key).map((a) => sumMoney([a.amount, -a.platformFee])));
    return { key, value };
  });

  return NextResponse.json({
    total: net(all),
    thisMonth: net(thisMonth),
    lastMonth: net(lastMonth),
    days,
    transactions: page.slice(0, PAGE),
    hasMore: page.length > PAGE,
  });
});
