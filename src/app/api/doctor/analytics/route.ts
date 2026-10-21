import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { safeNum } from "@/lib/adminAuth";
import { istMonthKey, shiftMonthKey, istStartOfMonth, monthShortLabel } from "@/lib/istDate";

const MONTHS = 6;

// GET: the current doctor's own trends — monthly earnings/bookings, consult-type
// split, and a rating trend. Doctor-scoped counterpart to the admin doctor-earnings
// report; no cross-doctor comparison here, just this doctor's own numbers over time.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const denied = await requireActiveDoctor(authUser, { requireSubscription: true });
  if (denied) return denied;

  // Months are IST calendar months, however the server's clock is set: a
  // payment at 11:45 pm IST on the 31st counts in that month, not the next.
  const thisMonth = istMonthKey(new Date());
  const windowStart = istStartOfMonth(shiftMonthKey(thisMonth, -(MONTHS - 1)));

  const [appointments, doctorProfile, reviews] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        doctorId: authUser.id,
        status: "COMPLETED",
        paymentStatus: "PAID",
        scheduledAt: { gte: windowStart },
      },
      select: { amount: true, platformFee: true, consultType: true, scheduledAt: true },
    }),
    prisma.doctorProfile.findUnique({
      where: { userId: authUser.id },
      select: { avgRating: true, totalReviews: true },
    }),
    prisma.review.findMany({
      where: { doctorId: authUser.id, createdAt: { gte: windowStart } },
      select: { rating: true, createdAt: true },
    }),
  ]);

  const monthKey = (d: Date) => istMonthKey(d);

  const months = [...Array(MONTHS)].map((_, i) => {
    const key = shiftMonthKey(thisMonth, -(MONTHS - 1) + i);
    return { key, label: monthShortLabel(key) };
  });

  const byMonth = new Map(months.map((m) => [m.key, { bookings: 0, gross: 0, platformFee: 0, net: 0 }]));
  const byConsultType = new Map<string, { count: number; net: number }>();

  for (const a of appointments) {
    const key = monthKey(new Date(a.scheduledAt));
    const bucket = byMonth.get(key);
    const gross = safeNum(a.amount);
    const fee = safeNum(a.platformFee);
    if (bucket) {
      bucket.bookings += 1;
      bucket.gross += gross;
      bucket.platformFee += fee;
      bucket.net += gross - fee;
    }
    const ct = byConsultType.get(a.consultType) ?? { count: 0, net: 0 };
    ct.count += 1;
    ct.net += gross - fee;
    byConsultType.set(a.consultType, ct);
  }

  const ratingByMonth = new Map(months.map((m) => [m.key, { sum: 0, count: 0 }]));
  for (const r of reviews) {
    const key = monthKey(new Date(r.createdAt));
    const bucket = ratingByMonth.get(key);
    if (bucket) {
      bucket.sum += r.rating;
      bucket.count += 1;
    }
  }

  return NextResponse.json({
    months: months.map((m) => ({ label: m.label, ...byMonth.get(m.key)! })),
    consultTypes: [...byConsultType.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.net - a.net),
    ratings: {
      avgRating: doctorProfile?.avgRating ?? 0,
      totalReviews: doctorProfile?.totalReviews ?? 0,
      monthly: months.map((m) => {
        const b = ratingByMonth.get(m.key)!;
        return { label: m.label, avgRating: b.count > 0 ? b.sum / b.count : null, count: b.count };
      }),
    },
  });
}
