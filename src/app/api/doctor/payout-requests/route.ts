import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveProvider } from "@/lib/providerGuard";
import { unsettledDues, duesFor, UNSETTLED_WHERE } from "@/lib/payouts";
import { money } from "@/lib/money";
import { withErrorLocale } from "@/lib/apiErrors";

// Shared by doctors and nurses (their earnings are the same Appointment rows).

async function bankDetailsOnFile(userId: string, role: string, db: Pick<typeof prisma, "nurseProfile" | "doctorProfile"> = prisma): Promise<boolean> {
  const profile = role === "NURSE"
    ? await db.nurseProfile.findUnique({ where: { userId }, select: { bankDetails: true } })
    : await db.doctorProfile.findUnique({ where: { userId }, select: { bankDetails: true } });
  return !!profile?.bankDetails?.trim();
}

// GET: the provider's own payout requests (newest first; a pending one with
// `currentAmount`, what settling it would pay now), what's owed right
// now (online payouts net of the commission on cash visits — the amount a
// request would ask for; src/lib/payouts.ts), and whether bank details are on
// file to pay it to.
export const GET = withErrorLocale(async function GET() {
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
  // A pending request isn't a frozen amount: the admin's settlement pays what's
  // owed when it runs. `amount` is what was owed when it was asked for
  // (or, once fulfilled, what was paid); `currentAmount` is what it'd pay now.
  return NextResponse.json({
    requests: requests.map((r) => ({
      ...r,
      amount: money(r.amount),
      ...(r.status === "PENDING" ? { currentAmount: dues.netAmount } : {}),
    })),
    dues,
    bankDetailsOnFile: bank,
  });
});

// POST: the provider flags "please settle me" — doesn't settle anything itself
// (only the admin's Settle Now action does that), just surfaces the request
// in the admin's settle queue. Blocked while a request is already open,
// without bank details to pay to, or when nothing is owed after the
// commission on cash visits is netted off.
export const POST = withErrorLocale(async function POST() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR" && authUser.role !== "NURSE") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const suspendedResponse = await requireActiveProvider(authUser, { requireSubscription: true });
  if (suspendedResponse) return suspendedResponse;

  // Check + insert under a per-provider transaction-scoped advisory lock, so a
  // double/quadruple tap can't open several PENDING requests (BUG-TRACKER #72):
  // parallel POSTs queue on the lock and the later ones see the first's row.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout-request:${authUser.id}`}))`;
    const existing = await tx.payoutRequest.findFirst({
      where: { doctorId: authUser.id, status: "PENDING" },
    });
    if (existing) {
      return NextResponse.json({ error: "You already have a payout request awaiting review." }, { status: 409 });
    }

    if (!(await bankDetailsOnFile(authUser.id, authUser.role, tx))) {
      return NextResponse.json(
        { error: "Add your bank details in your profile before requesting a payout.", code: "BANK_DETAILS_REQUIRED" },
        { status: 409 }
      );
    }

    const dues = await duesFor({ ...UNSETTLED_WHERE, doctorId: authUser.id }, tx);
    if (dues.netAmount <= 0) {
      const error = dues.onlinePayoutOwed > 0
        ? `The platform fee on your cash visits (₹${dues.cashFeeOwed}) covers your online earnings (₹${dues.onlinePayoutOwed}) — there's nothing to pay out. The admin will settle the balance with you.`
        : "There's no pending payout to request right now.";
      return NextResponse.json({ error, code: "NOTHING_TO_PAY", dues }, { status: 400 });
    }

    const created = await tx.payoutRequest.create({
      data: { doctorId: authUser.id, amount: dues.netAmount },
    });
    return NextResponse.json(created);
  });
  return result;
});
