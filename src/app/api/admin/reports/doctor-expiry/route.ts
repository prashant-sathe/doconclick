import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

const EXPIRING_SOON_DAYS = 7;

// GET: when each doctor's free trial / paid subscription lapses.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const profiles = await prisma.doctorProfile.findMany({
    select: {
      trialEndsAt: true,
      subscriptionPaidUntil: true,
      status: true,
      user: { select: { id: true, name: true, mobile: true } },
    },
  });

  const now = Date.now();
  const rows = profiles.map((p) => {
    const trial = p.trialEndsAt ? new Date(p.trialEndsAt).getTime() : null;
    const sub = p.subscriptionPaidUntil ? new Date(p.subscriptionPaidUntil).getTime() : null;
    const effectiveExpiry = Math.max(trial ?? 0, sub ?? 0) || null;
    const daysRemaining = effectiveExpiry ? Math.ceil((effectiveExpiry - now) / 86_400_000) : null;

    let expiryStatus: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "NEVER_ACTIVATED";
    if (!effectiveExpiry) expiryStatus = "NEVER_ACTIVATED";
    else if (effectiveExpiry < now) expiryStatus = "EXPIRED";
    else if (daysRemaining !== null && daysRemaining <= EXPIRING_SOON_DAYS) expiryStatus = "EXPIRING_SOON";
    else expiryStatus = "ACTIVE";

    return {
      doctorId: p.user.id,
      doctorName: p.user.name,
      doctorMobile: p.user.mobile,
      doctorStatus: p.status,
      trialEndsAt: p.trialEndsAt,
      subscriptionPaidUntil: p.subscriptionPaidUntil,
      effectiveExpiry: effectiveExpiry ? new Date(effectiveExpiry) : null,
      daysRemaining,
      expiryStatus,
    };
  });

  rows.sort((a, b) => (a.effectiveExpiry?.getTime() ?? Infinity) - (b.effectiveExpiry?.getTime() ?? Infinity));

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const filtered = status && status !== "ALL" ? rows.filter((r) => r.expiryStatus === status) : rows;

  return NextResponse.json({
    summary: {
      active: rows.filter((r) => r.expiryStatus === "ACTIVE").length,
      expiringSoon: rows.filter((r) => r.expiryStatus === "EXPIRING_SOON").length,
      expired: rows.filter((r) => r.expiryStatus === "EXPIRED").length,
      neverActivated: rows.filter((r) => r.expiryStatus === "NEVER_ACTIVATED").length,
    },
    rows: filtered,
  });
}
