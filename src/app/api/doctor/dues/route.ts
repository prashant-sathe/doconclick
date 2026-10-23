import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { unsettledDues } from "@/lib/payouts";
import { owedByDoctor, getCashDueLimit } from "@/lib/duesPayments";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: what the doctor owes the platform (commission on cash visits net of
// online earnings), the cash-due limit, and whether a payment of theirs is
// waiting on the admin. No plan required — an expired doctor can still pay.
export const GET = withErrorLocale(async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const [dues, limit, inReview] = await Promise.all([
    unsettledDues(authUser.id),
    getCashDueLimit(),
    prisma.duesPayment.count({ where: { doctorId: authUser.id, status: "PAID", settlementId: null } }),
  ]);
  const owed = owedByDoctor(dues);
  return NextResponse.json({ dues, owed, limit, cashBlocked: limit > 0 && owed >= limit, inReview });
});
