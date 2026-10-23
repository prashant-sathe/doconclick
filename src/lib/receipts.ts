import { prisma } from "@/lib/prisma";
import { netPayable } from "@/lib/coupons";
import { formatProviderName } from "@/lib/utils";

// Patient receipts — one per paid appointment and per successful wallet
// top-up — built here and rendered to PDF in the browser (ReceiptDocument +
// src/lib/receiptPdf.tsx). Always English, like the prescription: it's a
// financial record the patient may hand to an employer or insurer.

export const DEFAULT_SUPPLIER_NAME = "DocOnClick";
// Consultations and nursing care are healthcare services (SAC 9993), exempt
// from GST — so the GST block reads Nil. Admins can override the wording.
export const HEALTHCARE_SAC = "9993";
export const DEFAULT_APPOINTMENT_TAX_NOTE =
  "Healthcare services (SAC 9993) are exempt from GST; no GST has been charged.";
export const TOPUP_TAX_NOTE =
  "Money added to your DocOnClick wallet is an advance for future bookings, not a supply of service; no GST is charged on it.";

export type ReceiptPaymentMode = "ONLINE" | "WALLET" | "CASH" | "FREE";

export interface ReceiptLine {
  description: string;
  detail: string | null;
  sac: string | null;
  amount: number;
}

export interface ReceiptData {
  kind: "APPOINTMENT" | "WALLET_TOPUP";
  id: string;
  receiptNo: string;
  issuedAt: string; // when the money was received
  supplier: { name: string; address: string | null; gstin: string | null };
  billedTo: { name: string; mobile: string; email: string | null };
  patientName: string | null; // the family member the visit was for, if not the account holder
  lines: ReceiptLine[];
  discount: { code: string | null; amount: number } | null;
  total: number;
  totalInWords: string;
  paymentMode: ReceiptPaymentMode;
  paymentId: string | null;
  orderId: string | null;
  taxNote: string;
  refundedAt: string | null; // a paid visit later cancelled and refunded to the wallet
  walletBalanceAfter: number | null; // top-ups only
}

// Errors are `{ status, error }` so the routes can hand them straight back.
export type ReceiptResult = { ok: true; data: ReceiptData } | { ok: false; status: number; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function receiptNumber(kind: ReceiptData["kind"], id: string) {
  return `${kind === "APPOINTMENT" ? "RCPT" : "WTU"}-${id.slice(-8).toUpperCase()}`;
}

async function supplier() {
  const s = await prisma.platformSettings.findFirst({
    select: { receiptLegalName: true, receiptAddress: true, receiptGstin: true, receiptTaxNote: true },
  });
  return {
    supplier: {
      name: s?.receiptLegalName?.trim() || DEFAULT_SUPPLIER_NAME,
      address: s?.receiptAddress?.trim() || null,
      gstin: s?.receiptGstin?.trim() || null,
    },
    taxNote: s?.receiptTaxNote?.trim() || DEFAULT_APPOINTMENT_TAX_NOTE,
  };
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} Hundred` : "", rest].filter(Boolean).join(" ");
}

// Indian numbering (lakh / crore), as printed on Indian receipts:
// 125050.5 → "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only".
export function amountInWords(amount: number): string {
  const rupees = Math.floor(round2(amount));
  const paise = Math.round((round2(amount) - rupees) * 100);
  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 10_000_000); n %= 10_000_000;
  const lakh = Math.floor(n / 100_000); n %= 100_000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`); // receipts never reach ₹1,000 crore
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  const words = parts.length ? parts.join(" ") : "Zero";
  return `Rupees ${words}${paise ? ` and ${below1000(paise)} Paise` : ""} Only`;
}

const CONSULT_LABEL: Record<string, string> = { CLINIC: "Clinic visit", VIDEO: "Video consultation", HOME: "Home visit" };

function visitDate(d: Date) {
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

// A paid appointment's receipt — for the patient who booked it, or an admin.
export async function appointmentReceipt(id: string, viewer: { id: string; role: string }): Promise<ReceiptResult> {
  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { name: true, mobile: true, email: true } },
      doctor: { select: { name: true, doctorProfile: { select: { specialty: true } } } },
      clinic: { select: { name: true } },
      walletTransaction: { select: { type: true, status: true } },
      package: { select: { visits: true } },
    },
  });
  if (!appt || (viewer.role !== "ADMIN" && appt.patientId !== viewer.id)) {
    return { ok: false, status: 404, error: "Appointment not found" };
  }
  if (appt.paymentStatus !== "PAID") {
    return { ok: false, status: 400, error: "A receipt is available once the appointment is paid." };
  }

  const net = netPayable(appt);
  // How it was paid: a wallet debit row → wallet; a gateway payment id →
  // online; a ₹0 booking → free; otherwise collected in cash at the visit.
  const paymentMode: ReceiptPaymentMode =
    appt.walletTransaction?.type === "BOOKING_PAYMENT" && appt.walletTransaction.status === "SUCCESS" ? "WALLET"
      : appt.cashfreePaymentId ? "ONLINE"
        : net === 0 ? "FREE"
          : "CASH";

  const isNurse = appt.providerType === "NURSE";
  const provider = formatProviderName(appt.doctor.name, appt.providerType);
  const description = isNurse
    ? `Nursing care — ${appt.serviceName ?? "Home visit"}${appt.packageIndex && appt.package ? ` (visit ${appt.packageIndex} of ${appt.package.visits})` : ""}`
    : `Medical consultation — ${CONSULT_LABEL[appt.consultType] ?? appt.consultType}`;
  const detail = [
    isNurse ? provider : `${provider}${appt.doctor.doctorProfile?.specialty ? `, ${appt.doctor.doctorProfile.specialty}` : ""}`,
    appt.consultType === "CLINIC" && appt.clinic ? appt.clinic.name : null,
    visitDate(appt.scheduledAt),
  ].filter(Boolean).join(" · ");

  const refund = await prisma.walletTransaction.findUnique({
    where: { refundOfAppointmentId: appt.id },
    select: { status: true, createdAt: true },
  });
  const { supplier: s, taxNote } = await supplier();

  return {
    ok: true,
    data: {
      kind: "APPOINTMENT",
      id: appt.id,
      receiptNo: receiptNumber("APPOINTMENT", appt.id),
      issuedAt: (appt.paidAt ?? appt.scheduledAt).toISOString(),
      supplier: s,
      billedTo: { name: appt.patient.name, mobile: appt.patient.mobile, email: appt.patient.email },
      patientName: appt.relation !== "Self" && appt.patientName ? `${appt.patientName} (${appt.relation})` : null,
      lines: [{ description, detail, sac: HEALTHCARE_SAC, amount: round2(appt.amount) }],
      discount: appt.discountAmount > 0 ? { code: appt.couponCode, amount: round2(appt.discountAmount) } : null,
      total: net,
      totalInWords: amountInWords(net),
      paymentMode,
      paymentId: paymentMode === "ONLINE" ? appt.cashfreePaymentId : null,
      orderId: paymentMode === "ONLINE" ? appt.cashfreeOrderId : null,
      taxNote,
      refundedAt: refund?.status === "SUCCESS" ? refund.createdAt.toISOString() : null,
      walletBalanceAfter: null,
    },
  };
}

// A successful wallet top-up's receipt — for the wallet's owner, or an admin.
export async function walletTopupReceipt(id: string, viewer: { id: string; role: string }): Promise<ReceiptResult> {
  const txn = await prisma.walletTransaction.findUnique({
    where: { id },
    include: { wallet: { select: { user: { select: { id: true, name: true, mobile: true, email: true } } } } },
  });
  if (!txn || txn.type !== "TOPUP" || (viewer.role !== "ADMIN" && txn.wallet.user.id !== viewer.id)) {
    return { ok: false, status: 404, error: "Top-up not found" };
  }
  if (txn.status !== "SUCCESS") {
    return { ok: false, status: 400, error: "A receipt is available once the top-up succeeds." };
  }
  const { supplier: s } = await supplier();
  const amount = round2(txn.amount);
  const user = txn.wallet.user;

  return {
    ok: true,
    data: {
      kind: "WALLET_TOPUP",
      id: txn.id,
      receiptNo: receiptNumber("WALLET_TOPUP", txn.id),
      issuedAt: txn.createdAt.toISOString(),
      supplier: s,
      billedTo: { name: user.name, mobile: user.mobile, email: user.email },
      patientName: null,
      lines: [{ description: "Wallet top-up", detail: "Added to your DocOnClick wallet", sac: null, amount }],
      discount: null,
      total: amount,
      totalInWords: amountInWords(amount),
      paymentMode: "ONLINE",
      paymentId: txn.cashfreePaymentId,
      orderId: txn.cashfreeOrderId,
      taxNote: TOPUP_TAX_NOTE,
      refundedAt: null,
      walletBalanceAfter: txn.balanceAfter,
    },
  };
}
