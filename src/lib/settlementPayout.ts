import { addDaysYmd, istDayKey, istStartOfDay, isValidYmd } from "@/lib/istDate";

// Settlement payout lifecycle (F27). "Settle Now" prepares the record (the
// visits are claimed and the net is frozen); the money goes out separately,
// by bank transfer, and the admin then marks it paid with the UTR. A plain
// string field, not an enum (repo convention).
export const SETTLEMENT_STATUS = {
  PREPARED: "PREPARED", // the platform owes the net and hasn't sent it yet
  PAID: "PAID", // sent — payoutReference + paidAt recorded
  NO_PAYOUT: "NO_PAYOUT", // net ≤ 0: nothing for the platform to send
} as const;

export function initialSettlementStatus(netAmount: number): string {
  return netAmount > 0 ? SETTLEMENT_STATUS.PREPARED : SETTLEMENT_STATUS.NO_PAYOUT;
}

// UTR / bank reference: IMPS 12, NEFT 16, RTGS 22 characters, plus room for
// other bank formats. Letters and digits, with "-" or "/" inside.
const UTR_RE = /^[A-Z0-9](?:[A-Z0-9/-]{4,38})[A-Z0-9]$/;

export function normalizePayoutReference(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const ref = raw.replace(/\s+/g, "").toUpperCase();
  return UTR_RE.test(ref) ? ref : null;
}

export const PAYOUT_NOTE_MAX = 500;
export const DISMISS_REASON_MIN = 5;
export const DISMISS_REASON_MAX = 300;
// Why an admin corrected a PAID settlement's UTR/date (P3-32) — kept in the audit row.
export const CORRECTION_REASON_MIN = 5;
export const CORRECTION_REASON_MAX = 300;
// How far back a payout date may be entered.
const PAID_ON_MAX_AGE_DAYS = 365;

// The IST calendar day the transfer went out ("YYYY-MM-DD"): not in the
// future and not more than a year back. Stored as the start of that IST day.
export function parsePaidOn(raw: unknown, now = new Date()): Date | null {
  if (typeof raw !== "string" || !isValidYmd(raw)) return null;
  const today = istDayKey(now);
  if (raw > today || raw < addDaysYmd(today, -PAID_ON_MAX_AGE_DAYS)) return null;
  return istStartOfDay(raw);
}

// What a provider may see of their own settlements — a whitelist, so the
// admin-only payout note (and admin ids) can never leak to them.
export const PROVIDER_SETTLEMENT_SELECT = {
  id: true,
  cashCount: true,
  onlineCount: true,
  cashFeeOwed: true,
  onlinePayoutOwed: true,
  netAmount: true,
  note: true,
  createdAt: true,
  status: true,
  payoutReference: true,
  paidAt: true,
} as const;
