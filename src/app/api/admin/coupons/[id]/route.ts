import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { parseCouponInput, validateCouponConfig } from "@/lib/coupons";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

// GET: a single coupon with usage stats
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!coupon) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  const { _count, ...rest } = coupon;
  return NextResponse.json({ ...rest, redemptionCount: _count.redemptions });
}

// PATCH: edit fields / toggle isActive
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = parseCouponInput(body, { partial: true });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.data.code && parsed.data.code !== existing.code) {
    const clash = await prisma.coupon.findUnique({ where: { code: parsed.data.code } });
    if (clash) {
      return NextResponse.json({ error: "A coupon with that code already exists." }, { status: 409 });
    }
  }

  // Validate the coupon as it will be stored — existing + patch. A PATCH
  // that sends only `discountType` or only one date must be judged against
  // the rest of the coupon, not on its own.
  const merged = { ...existing, ...parsed.data };
  const config = validateCouponConfig(merged, {
    // A past expiry is refused when it's being set or the coupon is being
    // turned back on — deactivating or editing one that already expired is fine.
    checkExpiry: "expiresAt" in parsed.data || parsed.data.isActive === true,
  });
  if ("error" in config) return NextResponse.json({ error: config.error }, { status: 400 });

  const coupon = await prisma.coupon.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ...coupon, warnings: config.warnings });
}

// DELETE: hard-delete only if never redeemed, otherwise tell the admin to deactivate
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.coupon.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  if (existing._count.redemptions > 0) {
    return NextResponse.json(
      { error: "This coupon has been used — deactivate it instead of deleting." },
      { status: 409 },
    );
  }

  await prisma.coupon.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
