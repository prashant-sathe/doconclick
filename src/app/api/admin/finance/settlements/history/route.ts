import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { parseDateRange } from "@/lib/adminAuth";
import { moneyFields } from "@/lib/money";

// GET: past settlements across all doctors, newest first. Optional ?from=&to=&doctorId= filters.
export async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsedRange = parseDateRange(searchParams);
  if (parsedRange.response) return parsedRange.response;
  const range = parsedRange.range;
  const doctorId = searchParams.get("doctorId");

  const settlements = await prisma.settlement.findMany({
    where: {
      ...(range.gte || range.lte ? { createdAt: range } : {}),
      ...(doctorId ? { doctorId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      doctor: { select: { name: true, role: true } },
      settledByAdmin: { select: { name: true } },
      paidByAdmin: { select: { name: true } },
      // UTR/date corrections on a paid settlement (P3-32), newest first.
      payoutCorrections: {
        orderBy: { createdAt: "desc" },
        select: { previousReference: true, previousPaidAt: true, newReference: true, newPaidAt: true, reason: true, correctedByAdminId: true, createdAt: true },
      },
    },
  });

  // Who made each correction (a plain id on the audit row, so deleting an admin never touches it).
  const adminIds = [...new Set(settlements.flatMap((s) => s.payoutCorrections.map((c) => c.correctedByAdminId)))];
  const admins = adminIds.length
    ? new Map((await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
    : new Map<string, string>();

  // Rounded to paise — older rows were stored from float sums.
  return NextResponse.json(settlements.map((s) => ({
    ...moneyFields(s, ["cashFeeOwed", "onlinePayoutOwed", "netAmount"] as const),
    payoutCorrections: s.payoutCorrections.map((c) => ({ ...c, correctedByAdminName: admins.get(c.correctedByAdminId) ?? null })),
  })));
}
