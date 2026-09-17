import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { safeNum } from "@/lib/adminAuth";

const MONTHS = 6;

// GET: the current doctor's own trends — monthly earnings/bookings, consult-type
// split, and a rating trend. Doctor-scoped counterpart to the admin doctor-earnings
// report; no cross-doctor comparison here, just this doctor's own numbers over time.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);

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

  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const months = [...Array(MONTHS)].map((_, i) => {
    const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1);
    return { key: monthKey(d), label: d.toLocaleDateString("en-IN", { month: "short" }) };
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
