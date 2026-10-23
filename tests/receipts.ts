// Receipts (F11): GET /api/receipts/appointments/[id] and /api/receipts/wallet/[id]
// return the data for a PDF receipt — a paid appointment (wallet / online /
// cash / free, coupon discount, family member, refunded later) and a
// successful wallet top-up; only the owning patient or an admin may fetch
// one, others get 404 (doctors 403); unpaid visits and pending top-ups are
// refused; the admin's supplier details (name, address, GSTIN, tax note)
// print on the receipt and a malformed GSTIN is rejected. Pure checks, then
// against a live dev server and the DB in .env, throwaway users only.
//
//   npm run test:receipts        (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { amountInWords, receiptNumber, DEFAULT_APPOINTMENT_TAX_NOTE } from "../src/lib/receipts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { ...(as ? { Cookie: cookieFor(as) } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}

function pure() {
  const words: [number, string][] = [
    [0, "Rupees Zero Only"],
    [500, "Rupees Five Hundred Only"],
    [1099.5, "Rupees One Thousand Ninety Nine and Fifty Paise Only"],
    [125050, "Rupees One Lakh Twenty Five Thousand Fifty Only"],
    [21000000, "Rupees Two Crore Ten Lakh Only"],
    [13.07, "Rupees Thirteen and Seven Paise Only"],
  ];
  for (const [n, want] of words) check(`amountInWords(${n})`, amountInWords(n) === want, amountInWords(n));
  check("receipt numbers", receiptNumber("APPOINTMENT", "cmabcdefgh12345678") === "RCPT-12345678" && receiptNumber("WALLET_TOPUP", "x9abcdefgh") === "WTU-ABCDEFGH", receiptNumber("WALLET_TOPUP", "x9abcdefgh"));
}

async function main() {
  pure();

  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `7${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const patient = await mk({ name: "Receipt Patient", email: `receipt${stamp}@example.com`, role: "PATIENT", patientProfile: { create: { age: 40, gender: "Male" } } });
  const other = await mk({ name: "Other Patient", role: "PATIENT", patientProfile: { create: { age: 35, gender: "Female" } } });
  const doctor = await mk({ name: "Receipt Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, specialty: "Dermatologist" } } });
  const admin = await mk({ name: "Receipt Admin", role: "ADMIN" });

  const before = await prisma.platformSettings.findFirst();
  const appt = (data: Record<string, unknown>) => prisma.appointment.create({
    data: { doctorId: doctor.id, patientId: patient.id, status: "COMPLETED", consultType: "VIDEO", symptoms: "RECEIPT-TEST", amount: 500, scheduledAt: new Date("2026-10-20T05:00:00Z"), ...data } as never,
  });

  try {
    const wallet = await prisma.wallet.create({ data: { userId: patient.id, balance: 600 } });

    // ── Paid from the wallet, with a coupon, for a family member ──
    const walletPaid = await appt({ paymentMethod: "ONLINE", paymentStatus: "PAID", paidAt: new Date("2026-10-19T10:00:00Z"), discountAmount: 100, couponCode: "WELCOME100", relation: "Mother", patientName: "Asha" });
    await prisma.walletTransaction.create({ data: { walletId: wallet.id, type: "BOOKING_PAYMENT", amount: 400, balanceAfter: 600, status: "SUCCESS", appointmentId: walletPaid.id } });
    let r = await call(patient, "GET", `/api/receipts/appointments/${walletPaid.id}`);
    const lines = r.json.lines as { description: string; detail: string; sac: string; amount: number }[] | undefined;
    check("wallet-paid visit → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    check("…paid via wallet, total = fee − coupon, in words",
      r.json.paymentMode === "WALLET" && r.json.total === 400 && r.json.totalInWords === "Rupees Four Hundred Only" && (r.json.discount as J)?.code === "WELCOME100" && (r.json.discount as J)?.amount === 100,
      `${r.json.paymentMode} ₹${r.json.total} ${JSON.stringify(r.json.discount)}`);
    check("…line: video consultation, SAC 9993, full fee, doctor + specialty",
      lines?.length === 1 && lines[0].description.includes("Video consultation") && lines[0].sac === "9993" && lines[0].amount === 500 && lines[0].detail.includes("Dermatologist"),
      JSON.stringify(lines?.[0]));
    check("…billed to the account holder, for the family member, issued at paidAt",
      (r.json.billedTo as J)?.name === "Receipt Patient" && (r.json.billedTo as J)?.email === `receipt${stamp}@example.com` && r.json.patientName === "Asha (Mother)" && r.json.issuedAt === "2026-10-19T10:00:00.000Z",
      `${(r.json.billedTo as J)?.name} / ${r.json.patientName} / ${r.json.issuedAt}`);
    check("…receipt no + no gateway ids + not refunded", r.json.receiptNo === receiptNumber("APPOINTMENT", walletPaid.id) && r.json.paymentId === null && r.json.refundedAt === null, `${r.json.receiptNo}`);

    // ── Access ──
    r = await call(other, "GET", `/api/receipts/appointments/${walletPaid.id}`);
    check("another patient → 404", r.status === 404, `${r.status}`);
    r = await call(doctor, "GET", `/api/receipts/appointments/${walletPaid.id}`);
    check("the doctor → 403", r.status === 403, `${r.status}`);
    r = await call(null, "GET", `/api/receipts/appointments/${walletPaid.id}`);
    check("signed out → 401", r.status === 401, `${r.status}`);
    r = await call(admin, "GET", `/api/receipts/appointments/${walletPaid.id}`);
    check("an admin → 200", r.status === 200 && r.json.total === 400, `${r.status}`);
    r = await call(patient, "GET", `/api/receipts/appointments/nope-${stamp}`);
    check("unknown appointment → 404", r.status === 404, `${r.status}`);

    // ── Other payment modes ──
    const online = await appt({ consultType: "CLINIC", paymentMethod: "ONLINE", paymentStatus: "PAID", paidAt: new Date(), cashfreeOrderId: `ord_${stamp}`, cashfreePaymentId: `cfp_${stamp}` });
    r = await call(patient, "GET", `/api/receipts/appointments/${online.id}`);
    check("gateway-paid → ONLINE with payment + order ids", r.json.paymentMode === "ONLINE" && r.json.paymentId === `cfp_${stamp}` && r.json.orderId === `ord_${stamp}` && r.json.total === 500, `${r.json.paymentMode} ${r.json.paymentId}`);
    const cash = await appt({ consultType: "HOME", paymentMethod: "CASH", paymentStatus: "PAID", paidAt: new Date() });
    r = await call(patient, "GET", `/api/receipts/appointments/${cash.id}`);
    check("cash at the visit → CASH, home visit", r.json.paymentMode === "CASH" && (r.json.lines as { description: string }[])[0].description.includes("Home visit"), `${r.json.paymentMode}`);
    const free = await appt({ paymentMethod: "ONLINE", paymentStatus: "PAID", paidAt: new Date(), discountAmount: 500, couponCode: "FREE" });
    r = await call(patient, "GET", `/api/receipts/appointments/${free.id}`);
    check("100% coupon → FREE, ₹0", r.json.paymentMode === "FREE" && r.json.total === 0, `${r.json.paymentMode} ₹${r.json.total}`);
    const unpaid = await appt({ status: "SCHEDULED", paymentMethod: "ONLINE", paymentStatus: "PENDING" });
    r = await call(patient, "GET", `/api/receipts/appointments/${unpaid.id}`);
    check("unpaid visit → 400", r.status === 400, `${r.status} ${r.json.error}`);

    // ── Paid, then cancelled and refunded to the wallet ──
    const refunded = await appt({ status: "CANCELLED", paymentMethod: "ONLINE", paymentStatus: "PAID", paidAt: new Date(), cashfreePaymentId: `cfr_${stamp}` });
    await prisma.walletTransaction.create({ data: { walletId: wallet.id, type: "CANCELLATION_REFUND", amount: 500, balanceAfter: 1100, status: "SUCCESS", refundOfAppointmentId: refunded.id } });
    r = await call(patient, "GET", `/api/receipts/appointments/${refunded.id}`);
    check("refunded visit → receipt notes the refund", r.status === 200 && typeof r.json.refundedAt === "string", `${r.status} ${r.json.refundedAt}`);

    // ── Wallet top-ups ──
    const topup = await prisma.walletTransaction.create({ data: { walletId: wallet.id, type: "TOPUP", amount: 1000, balanceAfter: 1600, status: "SUCCESS", cashfreeOrderId: `wto_${stamp}`, cashfreePaymentId: `wtp_${stamp}` } });
    r = await call(patient, "GET", `/api/receipts/wallet/${topup.id}`);
    check("successful top-up → 200 with ids, balance after, no SAC",
      r.status === 200 && r.json.kind === "WALLET_TOPUP" && r.json.total === 1000 && r.json.paymentId === `wtp_${stamp}` && r.json.walletBalanceAfter === 1600 && (r.json.lines as { sac: string | null }[])[0].sac === null && r.json.receiptNo === receiptNumber("WALLET_TOPUP", topup.id),
      `${r.status} ₹${r.json.total} ${r.json.receiptNo}`);
    r = await call(other, "GET", `/api/receipts/wallet/${topup.id}`);
    check("another patient's top-up → 404", r.status === 404, `${r.status}`);
    r = await call(admin, "GET", `/api/receipts/wallet/${topup.id}`);
    check("admin → top-up receipt 200", r.status === 200, `${r.status}`);
    const pending = await prisma.walletTransaction.create({ data: { walletId: wallet.id, type: "TOPUP", amount: 200, status: "PENDING" } });
    r = await call(patient, "GET", `/api/receipts/wallet/${pending.id}`);
    check("pending top-up → 400", r.status === 400, `${r.status} ${r.json.error}`);
    const debit = await prisma.walletTransaction.findUniqueOrThrow({ where: { appointmentId: walletPaid.id } });
    r = await call(patient, "GET", `/api/receipts/wallet/${debit.id}`);
    check("a booking-payment row is not a top-up → 404", r.status === 404, `${r.status}`);

    // ── Supplier details from admin settings ──
    r = await call(admin, "PATCH", "/api/admin/settings", { receiptGstin: "27ABCDE1234F1Z" });
    check("short GSTIN → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(admin, "PATCH", "/api/admin/settings", { receiptGstin: "27abcde1234f1z5", receiptLegalName: "  DocOnClick Health Pvt Ltd ", receiptAddress: "Pune, Maharashtra", receiptTaxNote: "" });
    check("valid GSTIN saved upper-cased, name trimmed, blank note cleared", r.status === 200 && r.json.receiptGstin === "27ABCDE1234F1Z5" && r.json.receiptLegalName === "DocOnClick Health Pvt Ltd" && r.json.receiptTaxNote === null, `${r.status} ${r.json.receiptGstin}`);
    r = await call(patient, "PATCH", "/api/admin/settings", { receiptGstin: "27ABCDE1234F1Z5" });
    check("a patient can't change receipt settings → 403", r.status === 403, `${r.status}`);
    r = await call(patient, "GET", `/api/receipts/appointments/${online.id}`);
    const sup = r.json.supplier as J;
    check("receipt prints the supplier + default GST note", sup?.name === "DocOnClick Health Pvt Ltd" && sup?.gstin === "27ABCDE1234F1Z5" && sup?.address === "Pune, Maharashtra" && r.json.taxNote === DEFAULT_APPOINTMENT_TAX_NOTE, JSON.stringify(sup));

    // ── Screens still render ──
    for (const path of ["/patient/appointments", "/patient/wallet"]) {
      const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookieFor(patient) }, redirect: "manual" });
      check(`${path} → 200`, res.status === 200, `${res.status}`);
    }
  } finally {
    if (before) {
      await prisma.platformSettings.update({
        where: { id: before.id },
        data: { receiptLegalName: before.receiptLegalName, receiptAddress: before.receiptAddress, receiptGstin: before.receiptGstin, receiptTaxNote: before.receiptTaxNote },
      });
    }
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
