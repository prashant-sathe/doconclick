import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorLocale } from "@/lib/apiErrors";

// Public (no auth) marketing counters for the homepage. Each figure is only
// returned once it is big enough to be worth showing — below the threshold it
// is null and the UI hides it, so an early-stage site never advertises tiny
// or inflated numbers. Reviews: rating only once there are enough of them.
const MIN_DOCTORS = 25;
const MIN_CONSULTATIONS = 500;
const MIN_REVIEWS = 30;

// Not prerendered: the DB isn't reachable during `next build` (Docker). The
// 1h cache is served via Cache-Control instead.
export const dynamic = "force-dynamic";

export const GET = withErrorLocale(async function GET() {
  const [doctors, consultations, ratingAgg] = await Promise.all([
    prisma.doctorProfile.count({
      where: { status: "APPROVED", isVerified: true },
    }),
    prisma.appointment.count({ where: { status: "COMPLETED" } }),
    prisma.review.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const reviews = ratingAgg._count._all;
  return NextResponse.json(
    {
      doctors: doctors >= MIN_DOCTORS ? doctors : null,
      consultations: consultations >= MIN_CONSULTATIONS ? consultations : null,
      rating:
        reviews >= MIN_REVIEWS && ratingAgg._avg.rating
          ? Math.round(ratingAgg._avg.rating * 10) / 10
          : null,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
      },
    },
  );
});
