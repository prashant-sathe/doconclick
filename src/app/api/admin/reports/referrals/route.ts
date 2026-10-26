import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, parseDateRange } from "@/lib/adminAuth";
import { money, sumMoney } from "@/lib/money";
import { REFERRAL_STATUSES } from "@/lib/referrals";

// GET ?from&to&status — Invite & earn (FP1-23): every referred sign-up in
// the range (by sign-up day, IST), who referred them, and what was paid.
// Invites = sign-ups through a link; conversions = rewarded; payout = the
// wallet credit given.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const parsedRange = parseDateRange(searchParams);
  if (parsedRange.response) return parsedRange.response;
  const range = parsedRange.range;
  const status = searchParams.get("status");
  if (status && status !== "ALL" && !(REFERRAL_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const referrals = await prisma.referral.findMany({
    where: range.gte || range.lte ? { createdAt: range } : {},
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: {
      id: true, inviteeRole: true, status: true, rejectReason: true, rewardAmount: true, rewardedAt: true, createdAt: true,
      referrer: { select: { name: true, role: true, mobile: true, deletedAt: true } },
      invitee: { select: { name: true, mobile: true, deletedAt: true } },
    },
  });

  // Deleted accounts keep their row, without the number.
  const mobileOf = (u: { mobile: string; deletedAt: Date | null }) => (u.deletedAt || !/^\d{10}$/.test(u.mobile) ? null : u.mobile);
  const rows = referrals.map((r) => ({
    id: r.id,
    referrerName: r.referrer.name || null,
    referrerRole: r.referrer.role,
    referrerMobile: mobileOf(r.referrer),
    inviteeName: r.invitee.name || null,
    inviteeRole: r.inviteeRole,
    inviteeMobile: mobileOf(r.invitee),
    status: r.status,
    rejectReason: r.rejectReason,
    rewardAmount: r.rewardAmount == null ? null : money(r.rewardAmount),
    signedUpAt: r.createdAt,
    rewardedAt: r.rewardedAt,
  }));
  const rewarded = rows.filter((r) => r.status === "REWARDED");

  return NextResponse.json({
    summary: {
      invites: rows.length,
      conversions: rewarded.length,
      pending: rows.filter((r) => r.status === "PENDING").length,
      rejected: rows.filter((r) => r.status === "REJECTED").length,
      payout: sumMoney(rewarded.map((r) => r.rewardAmount ?? 0)),
    },
    rows: status && status !== "ALL" ? rows.filter((r) => r.status === status) : rows,
  });
}
