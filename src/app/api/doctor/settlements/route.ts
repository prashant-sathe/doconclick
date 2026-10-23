import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveProvider } from "@/lib/providerGuard";
import { moneyFields } from "@/lib/money";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: the current doctor's own past settlements, newest first
export const GET = withErrorLocale(async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR" && authUser.role !== "NURSE") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const denied = await requireActiveProvider(authUser, { requireSubscription: true });
  if (denied) return denied;

  const settlements = await prisma.settlement.findMany({
    where: { doctorId: authUser.id },
    orderBy: { createdAt: "desc" },
  });

  // Rounded to paise — older rows were stored from float sums.
  return NextResponse.json(settlements.map((s) => moneyFields(s, ["cashFeeOwed", "onlinePayoutOwed", "netAmount"] as const)));
});
