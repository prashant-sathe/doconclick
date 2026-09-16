import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { safeNum } from "@/lib/adminAuth";

const PENDING_APPOINTMENT_WHERE = { status: "COMPLETED", paymentStatus: "PAID", settlementId: null } as const;

// GET: the current doctor's own payout requests, newest first
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const requests = await prisma.payoutRequest.findMany({
    where: { doctorId: authUser.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(requests);
}

// POST: the doctor flags "please settle me" — doesn't settle anything itself
// (only the admin's Settle Now action does that), just surfaces the request
// in the admin's settle queue. Blocked while a request is already open, or
// there's nothing currently owed to request against.
export async function POST() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const existing = await prisma.payoutRequest.findFirst({
    where: { doctorId: authUser.id, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a payout request awaiting review." }, { status: 409 });
  }

  const totals = await prisma.appointment.aggregate({
    where: { ...PENDING_APPOINTMENT_WHERE, doctorId: authUser.id, paymentMethod: "ONLINE" },
    _sum: { amount: true, platformFee: true },
  });
  const amount = safeNum(totals._sum.amount) - safeNum(totals._sum.platformFee);
  if (amount <= 0) {
    return NextResponse.json({ error: "There's no pending payout to request right now." }, { status: 400 });
  }

  const created = await prisma.payoutRequest.create({
    data: { doctorId: authUser.id, amount },
  });
  return NextResponse.json(created);
}
