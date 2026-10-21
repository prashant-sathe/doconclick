import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveProvider } from "@/lib/providerGuard";
import { unsettledDues } from "@/lib/payouts";
import { money } from "@/lib/money";

// Shared by doctors and nurses (their earnings are the same Appointment rows).

async function bankDetailsOnFile(userId: string, role: string): Promise<boolean> {
  const profile = role === "NURSE"
    ? await prisma.nurseProfile.findUnique({ where: { userId }, select: { bankDetails: true } })
    : await prisma.doctorProfile.findUnique({ where: { userId }, select: { bankDetails: true } });
  return !!profile?.bankDetails?.trim();
}

// GET: the provider's own payout requests (newest first), what's owed right
// now (online payouts net of the commission on cash visits — the amount a
// request would ask for; src/lib/payouts.ts), and whether bank details are on
// file to pay it to.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR" && authUser.role !== "NURSE") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const denied = await requireActiveProvider(authUser, { requireSubscription: true });
  if (denied) return denied;

  const [requests, dues, bank] = await Promise.all([
    prisma.payoutRequest.findMany({ where: { doctorId: authUser.id }, orderBy: { createdAt: "desc" } }),
    unsettledDues(authUser.id),
    bankDetailsOnFile(authUser.id, authUser.role),
  ]);
  return NextResponse.json({ requests: requests.map((r) => ({ ...r, amount: money(r.amount) })), dues, bankDetailsOnFile: bank });
}

// POST: the provider flags "please settle me" — doesn't settle anything itself
// (only the admin's Settle Now action does that), just surfaces the request
// in the admin's settle queue. Blocked while a request is already open,
// without bank details to pay to, or when nothing is owed after the
// commission on cash visits is netted off.
export async function POST() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR" && authUser.role !== "NURSE") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const suspendedResponse = await requireActiveProvider(authUser, { requireSubscription: true });
  if (suspendedResponse) return suspendedResponse;

  const existing = await prisma.payoutRequest.findFirst({
    where: { doctorId: authUser.id, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a payout request awaiting review." }, { status: 409 });
  }

  if (!(await bankDetailsOnFile(authUser.id, authUser.role))) {
    return NextResponse.json(
      { error: "Add your bank details in your profile before requesting a payout.", code: "BANK_DETAILS_REQUIRED" },
      { status: 409 }
    );
  }

  const dues = await unsettledDues(authUser.id);
  if (dues.netAmount <= 0) {
    const error = dues.onlinePayoutOwed > 0
      ? `The platform fee on your cash visits (₹${dues.cashFeeOwed}) covers your online earnings (₹${dues.onlinePayoutOwed}) — there's nothing to pay out. The admin will settle the balance with you.`
      : "There's no pending payout to request right now.";
    return NextResponse.json({ error, code: "NOTHING_TO_PAY", dues }, { status: 400 });
  }

  const created = await prisma.payoutRequest.create({
    data: { doctorId: authUser.id, amount: dues.netAmount },
  });
  return NextResponse.json(created);
}
