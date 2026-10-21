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
    },
  });

  // Rounded to paise — older rows were stored from float sums.
  return NextResponse.json(settlements.map((s) => moneyFields(s, ["cashFeeOwed", "onlinePayoutOwed", "netAmount"] as const)));
}
