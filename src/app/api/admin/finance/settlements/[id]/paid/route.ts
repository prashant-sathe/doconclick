import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { readJson } from "@/lib/routeGuards";
import { moneyFields } from "@/lib/money";
import {
  SETTLEMENT_STATUS, PAYOUT_NOTE_MAX, CORRECTION_REASON_MIN, CORRECTION_REASON_MAX, normalizePayoutReference, parsePaidOn,
} from "@/lib/settlementPayout";

const BAD_REFERENCE = "Enter the UTR / bank reference — 6 to 40 letters or digits (\"-\" and \"/\" allowed inside).";
const BAD_PAID_ON = "Enter the date the payout was sent (YYYY-MM-DD) — not in the future and within the last year.";

// A UTR already on another settlement isn't refused outright (one transfer
// can cover a correction) but is a 409 until the admin confirms it.
async function duplicateReferenceResponse(id: string, reference: string, confirmed: unknown) {
  if (confirmed === true) return null;
  const duplicates = await prisma.settlement.findMany({
    where: { payoutReference: reference, id: { not: id } },
    select: { id: true, paidAt: true, netAmount: true, doctor: { select: { name: true, role: true } } },
    take: 5,
  });
  if (duplicates.length === 0) return null;
  return NextResponse.json(
    { error: "This UTR is already recorded on another settlement.", code: "DUPLICATE_REFERENCE", requiresConfirmation: true, duplicates },
    { status: 409 }
  );
}

async function settlementResponse(id: string) {
  const updated = await prisma.settlement.findUniqueOrThrow({ where: { id }, include: { paidByAdmin: { select: { name: true } } } });
  return NextResponse.json(moneyFields(updated, ["cashFeeOwed", "onlinePayoutOwed", "netAmount"] as const));
}

// POST: the admin records that a prepared settlement's payout was actually
// sent — the bank reference/UTR, the day it went out, and an optional
// admin-only note. A conditional claim (PREPARED → PAID), so a double click
// or a second admin gets a 409 and a settlement is never marked paid twice.
// A UTR already on another settlement isn't refused outright (one transfer
// can cover a correction), but needs `confirmDuplicate: true`.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;

  const reference = normalizePayoutReference(body.reference);
  if (!reference) return NextResponse.json({ error: BAD_REFERENCE }, { status: 400 });
  const paidAt = parsePaidOn(body.paidOn);
  if (!paidAt) return NextResponse.json({ error: BAD_PAID_ON }, { status: 400 });
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return NextResponse.json({ error: "Note must be text." }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > PAYOUT_NOTE_MAX) {
    return NextResponse.json({ error: `Keep the note under ${PAYOUT_NOTE_MAX} characters.` }, { status: 400 });
  }

  const settlement = await prisma.settlement.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!settlement) return NextResponse.json({ error: "Settlement not found." }, { status: 404 });
  if (settlement.status !== SETTLEMENT_STATUS.PREPARED) {
    return NextResponse.json(
      { error: settlement.status === SETTLEMENT_STATUS.NO_PAYOUT
        ? "This settlement has no payout to send."
        : settlement.status === null
          ? "This settlement was settled before payout tracking and has no pending payout."
          : "This settlement is already marked paid." },
      { status: 409 }
    );
  }

  const duplicate = await duplicateReferenceResponse(id, reference, body.confirmDuplicate);
  if (duplicate) return duplicate;

  const { count } = await prisma.settlement.updateMany({
    where: { id, status: SETTLEMENT_STATUS.PREPARED },
    data: {
      status: SETTLEMENT_STATUS.PAID,
      payoutReference: reference,
      paidAt,
      payoutNote: note || null,
      paidByAdminId: authUser.id,
      markedPaidAt: new Date(),
    },
  });
  if (count === 0) {
    return NextResponse.json({ error: "This settlement was just marked paid — refresh to see it." }, { status: 409 });
  }

  return settlementResponse(id);
}

// PATCH: correct the UTR and/or date of a settlement already marked PAID
// (a typo, the wrong transfer). Same validation as Mark paid, plus a
// reason. The old values go into an append-only SettlementPayoutCorrection
// row in the same transaction as the update, and the update is conditional
// on the settlement still being PAID with exactly the values just read — a
// second admin correcting at the same moment gets a 409, never a lost entry.
// The admin note, the original "marked paid by/at" and the amounts are untouched.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;

  const reference = normalizePayoutReference(body.reference);
  if (!reference) return NextResponse.json({ error: BAD_REFERENCE }, { status: 400 });
  const paidAt = parsePaidOn(body.paidOn);
  if (!paidAt) return NextResponse.json({ error: BAD_PAID_ON }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim().replace(/\s+/g, " ") : "";
  if (reason.length < CORRECTION_REASON_MIN) {
    return NextResponse.json({ error: `Add a reason for the correction (at least ${CORRECTION_REASON_MIN} characters).` }, { status: 400 });
  }
  if (reason.length > CORRECTION_REASON_MAX) {
    return NextResponse.json({ error: `Keep the reason under ${CORRECTION_REASON_MAX} characters.` }, { status: 400 });
  }

  const settlement = await prisma.settlement.findUnique({ where: { id }, select: { id: true, status: true, payoutReference: true, paidAt: true } });
  if (!settlement) return NextResponse.json({ error: "Settlement not found." }, { status: 404 });
  if (settlement.status !== SETTLEMENT_STATUS.PAID) {
    return NextResponse.json(
      { error: settlement.status === SETTLEMENT_STATUS.PREPARED
        ? "This settlement isn't marked paid yet — use Mark paid."
        : "Only a settlement marked paid has a reference to correct." },
      { status: 409 }
    );
  }
  if (settlement.payoutReference === reference && settlement.paidAt?.getTime() === paidAt.getTime()) {
    return NextResponse.json({ error: "Nothing changed — the UTR and date are the same as recorded." }, { status: 400 });
  }

  if (settlement.payoutReference !== reference) {
    const duplicate = await duplicateReferenceResponse(id, reference, body.confirmDuplicate);
    if (duplicate) return duplicate;
  }

  const corrected = await prisma.$transaction(async (tx) => {
    const { count } = await tx.settlement.updateMany({
      where: { id, status: SETTLEMENT_STATUS.PAID, payoutReference: settlement.payoutReference, paidAt: settlement.paidAt },
      data: { payoutReference: reference, paidAt },
    });
    if (count === 0) return false;
    await tx.settlementPayoutCorrection.create({
      data: {
        settlementId: id,
        previousReference: settlement.payoutReference,
        previousPaidAt: settlement.paidAt,
        newReference: reference,
        newPaidAt: paidAt,
        reason,
        correctedByAdminId: authUser.id,
      },
    });
    return true;
  });
  if (!corrected) {
    return NextResponse.json({ error: "This payout was just changed by someone else — refresh and check it before correcting." }, { status: 409 });
  }

  return settlementResponse(id);
}
