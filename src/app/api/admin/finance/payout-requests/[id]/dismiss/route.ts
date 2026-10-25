import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { readJson } from "@/lib/routeGuards";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { money } from "@/lib/money";
import { DISMISS_REASON_MIN, DISMISS_REASON_MAX } from "@/lib/settlementPayout";

// POST: the admin dismisses a provider's open payout request with a reason
// (e.g. bank details wrong, amount disputed). Nothing is settled or paid —
// the request just stops showing as pending, and the provider is told why
// (push + inbox, in their language) and can ask again. A conditional claim
// on PENDING, so a double click or a racing Settle Now gets a 409.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;

  const reason = typeof body.reason === "string" ? body.reason.trim().replace(/\s+/g, " ") : "";
  if (reason.length < DISMISS_REASON_MIN) {
    return NextResponse.json({ error: `Add a reason (at least ${DISMISS_REASON_MIN} characters) — the provider sees it.` }, { status: 400 });
  }
  if (reason.length > DISMISS_REASON_MAX) {
    return NextResponse.json({ error: `Keep the reason under ${DISMISS_REASON_MAX} characters.` }, { status: 400 });
  }

  const { count } = await prisma.payoutRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "DISMISSED", resolvedAt: new Date(), dismissReason: reason, dismissedByAdminId: authUser.id },
  });
  const request = await prisma.payoutRequest.findUnique({
    where: { id },
    select: { id: true, status: true, amount: true, doctorId: true, resolvedAt: true, dismissReason: true, doctor: { select: { role: true } } },
  });
  if (!request) return NextResponse.json({ error: "Payout request not found." }, { status: 404 });
  if (count === 0) {
    return NextResponse.json(
      { error: request.status === "FULFILLED" ? "This request was already settled." : "This request was already dismissed." },
      { status: 409 }
    );
  }

  void sendPushToUser(request.doctorId, {
    key: "payoutRequestDismissed",
    values: { amount: money(request.amount), reason },
    url: request.doctor.role === "NURSE" ? "/nurse/earnings" : "/doctor/earnings",
  });

  return NextResponse.json({ id: request.id, status: request.status, resolvedAt: request.resolvedAt, dismissReason: request.dismissReason });
}
