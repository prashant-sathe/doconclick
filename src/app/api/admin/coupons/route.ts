import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { parseCouponInput } from "@/lib/coupons";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return authUser;
}

// GET: all coupons, newest first, with usage stats
export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });

  const confirmed = await prisma.couponRedemption.groupBy({
    by: ["couponId"],
    where: { status: "CONFIRMED" },
    _count: { _all: true },
    _sum: { discountAmount: true },
  });
  const byCoupon = new Map(confirmed.map((r) => [r.couponId, r]));

  return NextResponse.json(
    coupons.map(({ _count, ...c }) => ({
      ...c,
      redemptionCount: _count.redemptions,
      confirmedCount: byCoupon.get(c.id)?._count._all ?? 0,
      totalDiscountGiven: byCoupon.get(c.id)?._sum.discountAmount ?? 0,
    })),
  );
}

// POST: create a coupon
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => ({}));
  const parsed = parseCouponInput(body, { partial: false });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const existing = await prisma.coupon.findUnique({ where: { code: parsed.data.code! } });
  if (existing) {
    return NextResponse.json({ error: "A coupon with that code already exists." }, { status: 409 });
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: parsed.data.code!,
      description: parsed.data.description ?? null,
      discountType: parsed.data.discountType ?? "PERCENT",
      discountValue: parsed.data.discountValue!,
      maxDiscount: parsed.data.maxDiscount ?? null,
      minAmount: parsed.data.minAmount ?? 0,
      appliesTo: parsed.data.appliesTo ?? "APPOINTMENT",
      consultTypes: parsed.data.consultTypes ?? null,
      maxRedemptions: parsed.data.maxRedemptions ?? null,
      perUserLimit: parsed.data.perUserLimit ?? 1,
      startsAt: parsed.data.startsAt ?? null,
      expiresAt: parsed.data.expiresAt ?? null,
      isActive: parsed.data.isActive ?? true,
      createdByAdminId: admin.id,
    },
  });
  return NextResponse.json(coupon);
}
