// Payouts and money rounding (BUG-TRACKER #57): earnings/analytics/report
// APIs return rupees rounded to paise (no 300.29999999999995), what a provider
// is owed is online payouts net of the platform fee on their cash visits —
// the same figure on their earnings page, in their payout request, in the
// admin settle queue and in the settlement — and a payout request needs bank
// details on file. Pure checks, then against a live dev server and the DB in
// .env, throwaway rows only (report rows dated in 2033). Parallel payout
// requests open only one (BUG-TRACKER #72).
//
//   npm run test:payouts
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { money, sumMoney } from "../src/lib/money";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}
/** Every number in a JSON value under keys that look like money has ≤ 2 decimals. */
function moneyProblems(v: unknown, path = ""): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => moneyProblems(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => moneyProblems(x, path ? `${path}.${k}` : k));
  if (typeof v === "number" && /amount|revenue|fee|earning|payout|owed|gross|net|commission|discount|collected|total(?!bookings|reviews|patients|doctors|nurses|appointments)/i.test(path.split(".").pop() ?? "") && Math.round(v * 100) / 100 !== v) return [`${path}=${v}`];
  return [];
}

async function main() {
  // ── Pure ──
  check("sumMoney: 0.1 + 0.2 = 0.3", sumMoney([0.1, 0.2]) === 0.3, String(sumMoney([0.1, 0.2])));
  check("sumMoney: 3 × 100.1 = 300.3 (plain floats give 300.29999999999995)", sumMoney([100.1, 100.1, 100.1]) === 300.3 && 100.1 + 100.1 + 100.1 !== 300.3, String(sumMoney([100.1, 100.1, 100.1])));
  check("money: 12.345 → 12.35, −12.345 → −12.35 (half away from zero, no float noise)", money(12.345) === 12.35 && money(-12.345) === -12.35 && money(1.005) === 1.01, `${money(12.345)} ${money(-12.345)} ${money(1.005)}`);
  check("money: NaN / Infinity / null / '7.5' → 0, 0, 0, 7.5", money(NaN) === 0 && money(Infinity) === 0 && money(null) === 0 && money("7.5") === 7.5, "ok");

  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `7${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const docProfile = (extra: Record<string, unknown> = {}) => ({ create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), ...extra } });
  const admin = await mk({ name: "Payout Admin", role: "ADMIN" });
  const doctor = await mk({ name: "Payout Doctor", role: "DOCTOR", doctorProfile: docProfile() });
  const owes = await mk({ name: "Owing Doctor", role: "DOCTOR", doctorProfile: docProfile({ bankDetails: "HDFC | 1234567890 | IFSC: HDFC0001234" }) });
  const idle = await mk({ name: "Idle Doctor", role: "DOCTOR", doctorProfile: docProfile({ bankDetails: "HDFC | 1 | IFSC: HDFC0001234" }) });
  const racer = await mk({ name: "Racing Doctor", role: "DOCTOR", doctorProfile: docProfile({ bankDetails: "AXIS | 42 | IFSC: UTIB0000001" }) });
  const nurse = await mk({ name: "Payout Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED", registrationFeePaid: true, subscriptionPaidUntil: new Date(Date.now() + 30 * DAY), bankDetails: "SBI | 99 | IFSC: SBIN0000001" } } });
  const patient = await mk({ name: "Payout Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });

  const visit = (providerId: string, over: Record<string, unknown>) => prisma.appointment.create({ data: {
    doctorId: providerId, patientId: patient.id, symptoms: "x", consultType: "VIDEO", status: "COMPLETED", paymentStatus: "PAID",
    paymentMethod: "ONLINE", amount: 100.1, platformFee: 10.01, scheduledAt: new Date(Date.now() - 2 * DAY), paidAt: new Date(Date.now() - 2 * DAY), ...over,
  } as never });

  try {
    // Doctor: 3 online visits (₹100.10, fee ₹10.01) and 2 cash visits (fees ₹0.10, ₹0.20).
    for (let i = 0; i < 3; i++) await visit(doctor.id, {});
    await visit(doctor.id, { paymentMethod: "CASH", amount: 1, platformFee: 0.1 });
    await visit(doctor.id, { paymentMethod: "CASH", amount: 2, platformFee: 0.2 });
    // Owing doctor: ₹45 online payout, ₹100 fee on cash.
    await visit(owes.id, { amount: 50, platformFee: 5 });
    await visit(owes.id, { paymentMethod: "CASH", amount: 1000, platformFee: 100 });
    // Racing doctor: one ₹500 online visit (₹450 owed).
    await visit(racer.id, { amount: 500, platformFee: 50 });
    // Nurse: one online visit.
    await visit(nurse.id, { providerType: "NURSE", consultType: "HOME", amount: 799.99, platformFee: 80 });

    // ── Dues ──
    const g = await call(doctor, "GET", "/api/doctor/payout-requests");
    const dues = g.json.dues as Record<string, number>;
    check("GET: { requests, dues, bankDetailsOnFile }", g.status === 200 && Array.isArray(g.json.requests) && g.json.bankDetailsOnFile === false, `${g.status} bank=${g.json.bankDetailsOnFile}`);
    check("dues: online ₹270.27 owed − ₹0.30 cash fee = ₹269.97, all rounded", dues.onlinePayoutOwed === 270.27 && dues.cashFeeOwed === 0.3 && dues.netAmount === 269.97 && dues.onlineCount === 3 && dues.cashCount === 2, JSON.stringify(dues));

    // ── Bank details ──
    let r = await call(doctor, "POST", "/api/doctor/payout-requests");
    check("no bank details → 409 BANK_DETAILS_REQUIRED", r.status === 409 && r.json.code === "BANK_DETAILS_REQUIRED" && /bank details/i.test(r.json.error ?? ""), `${r.status} ${r.json.code} ${r.json.error}`);
    await prisma.doctorProfile.update({ where: { userId: doctor.id }, data: { bankDetails: "   " } });
    r = await call(doctor, "POST", "/api/doctor/payout-requests");
    check("whitespace-only bank details → still 409", r.status === 409 && r.json.code === "BANK_DETAILS_REQUIRED", `${r.status}`);
    check("…and no request was created", (await prisma.payoutRequest.count({ where: { doctorId: doctor.id } })) === 0, "ok");
    await prisma.doctorProfile.update({ where: { userId: doctor.id }, data: { bankDetails: "ICICI | 555 | IFSC: ICIC0000001" } });

    // ── The request is for the net amount ──
    r = await call(doctor, "POST", "/api/doctor/payout-requests");
    check("with bank details → 200, request for the net ₹269.97 (not the ₹270.27 online total)", r.status === 200 && r.json.amount === 269.97, `${r.status} ${r.json.amount} ${r.json.error ?? ""}`);
    r = await call(doctor, "POST", "/api/doctor/payout-requests");
    check("a second request while one is open → 409", r.status === 409, `${r.status}`);

    // ── The request isn't frozen: another online visit completes while it's pending ──
    await visit(doctor.id, {});
    const pendingView = await call(doctor, "GET", "/api/doctor/payout-requests");
    const pend = (pendingView.json.requests as { status: string; amount: number; currentAmount?: number }[]).find((x) => x.status === "PENDING");
    check("pending request: asked at ₹269.97, currentAmount ₹360.06 (what settling would pay now)", pend?.amount === 269.97 && pend?.currentAmount === 360.06 && (pendingView.json.dues as Record<string, number>).netAmount === 360.06, JSON.stringify(pend));

    // ── Cash fees exceed online payouts ──
    r = await call(owes, "POST", "/api/doctor/payout-requests");
    const od = r.json.dues as Record<string, number> | undefined;
    check("fees on cash > online owed → 400 NOTHING_TO_PAY explaining both", r.status === 400 && r.json.code === "NOTHING_TO_PAY" && od?.netAmount === -55 && /₹100/.test(r.json.error ?? "") && /₹45/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    r = await call(idle, "POST", "/api/doctor/payout-requests");
    check("nothing owed at all → 400 'no pending payout'", r.status === 400 && /no pending payout/i.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);

    // ── Nurse (bank details on the nurse profile) ──
    r = await call(nurse, "POST", "/api/doctor/payout-requests");
    check("nurse with bank details → request for ₹719.99", r.status === 200 && r.json.amount === 719.99, `${r.status} ${r.json.amount} ${r.json.error ?? ""}`);

    // ── Parallel taps open only one request (BUG-TRACKER #72) ──
    const race = await Promise.all(Array.from({ length: 4 }, () => call(racer, "POST", "/api/doctor/payout-requests")));
    const codes = race.map((x) => x.status).sort();
    check("4 parallel POSTs → 1×200 + 3×409 'awaiting review'", codes.join(",") === "200,409,409,409" && race.filter((x) => x.status === 409).every((x) => /awaiting review/i.test(x.json.error ?? "")), codes.join(","));
    const racerRows = await prisma.payoutRequest.findMany({ where: { doctorId: racer.id } });
    check("…and exactly one PENDING row for ₹450", racerRows.length === 1 && racerRows[0].status === "PENDING" && racerRows[0].amount === 450, racerRows.map((x) => `${x.status}:${x.amount}`).join(",") || "none");

    // ── Admin settle queue + settlement use the same figures ──
    const q = await call(admin, "GET", "/api/admin/finance/settlements");
    const row = (q.json as unknown as Record<string, unknown>[]).find((x) => x.doctorId === doctor.id) as Record<string, unknown>;
    check("settle queue: the current ₹360.06 net (₹0.30 cash fee), and the ₹269.97 they asked for", row?.netAmount === 360.06 && row?.cashFeeOwed === 0.3 && row?.onlinePayoutOwed === 360.36 && row?.payoutRequestedAmount === 269.97, JSON.stringify(row ?? null).slice(0, 200));
    const owesRow = (q.json as unknown as Record<string, unknown>[]).find((x) => x.doctorId === owes.id) as Record<string, unknown>;
    check("…and −₹55 for the doctor who owes", owesRow?.netAmount === -55, String(owesRow?.netAmount));
    const settled = await call(admin, "POST", "/api/admin/finance/settlements", { doctorId: doctor.id, idempotencyKey: `payout-test-${stamp}` });
    check("settling pays what's owed at settlement time (₹360.06), not the requested ₹269.97", settled.status === 200 && settled.json.netAmount === 360.06 && settled.json.cashFeeOwed === 0.3, `${settled.status} ${settled.json.netAmount}`);
    const pr = await prisma.payoutRequest.findFirst({ where: { doctorId: doctor.id } });
    check("…and fulfils the payout request, recording the ₹360.06 actually paid", pr?.status === "FULFILLED" && pr.amount === 360.06 && pr.settlementId === settled.json.id, `${pr?.status} ${pr?.amount}`);
    // An old settlement stored from a float sum comes back rounded.
    await prisma.settlement.create({ data: { doctorId: doctor.id, netAmount: 300.29999999999995, onlinePayoutOwed: 300.29999999999995, cashFeeOwed: 0, settledByAdminId: admin.id } });
    const mine = await call(doctor, "GET", "/api/doctor/settlements");
    const hist = await call(admin, "GET", `/api/admin/finance/settlements/history?doctorId=${doctor.id}`);
    const nets = (x: unknown) => (x as { netAmount: number }[]).map((s) => s.netAmount).sort().join(",");
    check("doctor's and admin's settlement lists round old float rows", nets(mine.json) === "300.3,360.06" && nets(hist.json) === "300.3,360.06", `${nets(mine.json)} / ${nets(hist.json)}`);
    const after = await call(doctor, "GET", "/api/doctor/payout-requests");
    check("after settling: nothing owed", (after.json.dues as Record<string, number>).netAmount === 0, JSON.stringify(after.json.dues));

    // ── Analytics: 3 × ₹100.10 this month ──
    const an = await call(doctor, "GET", "/api/doctor/analytics");
    const months = an.json.months as { gross: number; platformFee: number; net: number }[];
    const cur = months?.[months.length - 1];
    check("doctor analytics: this month gross ₹403.40, fee ₹40.34, net ₹363.06 (no float tails)", cur?.gross === 403.4 && cur?.platformFee === 40.34 && cur?.net === 363.06, JSON.stringify(cur));
    check("…nothing in the whole response has more than 2 decimals", moneyProblems(an.json).length === 0, moneyProblems(an.json).join(" ") || "ok");

    // ── Admin reports: three ₹0.10 + one ₹0.20 visits on 1 Jan 2033 ──
    const day = new Date("2033-01-01T06:00:00Z");
    for (const amt of [0.1, 0.1, 0.1, 0.2]) await visit(idle.id, { amount: amt, platformFee: amt / 10, discountAmount: 0, paidAt: day, scheduledAt: day, createdAt: day });
    const range = "from=2033-01-01&to=2033-01-01";
    const reports: [string, (j: J) => boolean, (j: J) => string][] = [
      ["revenue-summary", (j) => (j.summary as Record<string, number>).grossConsultRevenue === 0.5 && (j.summary as Record<string, number>).commissionBeforeCoupons === 0.05, (j) => JSON.stringify(j.summary)],
      ["revenue-by-consult-type", (j) => (j.summary as Record<string, number>).totalRevenue === 0.5, (j) => JSON.stringify(j.summary)],
      ["payment-collection", (j) => (j.summary as Record<string, number>).onlineCollected === 0.5, (j) => JSON.stringify(j.summary)],
      ["appointments", (j) => (j.summary as Record<string, number>).totalAmount === 0.5, (j) => JSON.stringify(j.summary)],
      ["doctor-earnings", (j) => (j.rows as Record<string, unknown>[]).some((x) => x.doctorId === idle.id && x.grossEarnings === 0.5 && x.netEarnings === 0.45), (j) => JSON.stringify((j.rows as Record<string, unknown>[]).find((x) => x.doctorId === idle.id))],
    ];
    for (const [name, ok, show] of reports) {
      const rep = await call(admin, "GET", `/api/admin/reports/${name}?${range}`);
      check(`report ${name}: 0.1+0.1+0.1+0.2 = 0.5 exactly, no float tails anywhere`, rep.status === 200 && ok(rep.json) && moneyProblems(rep.json).length === 0, `${show(rep.json)} ${moneyProblems(rep.json).slice(0, 3).join(" ")}`);
    }
    const dash = await call(admin, "GET", "/api/admin/analytics");
    check("admin dashboard money totals have ≤ 2 decimals", dash.status === 200 && moneyProblems({ totalRevenue: dash.json.totalRevenue, totalPlatformFee: dash.json.totalPlatformFee, totalCouponDiscounts: dash.json.totalCouponDiscounts, totalPlatformEarnings: dash.json.totalPlatformEarnings }).length === 0, `${dash.json.totalRevenue} ${dash.json.totalPlatformEarnings}`);
  } finally {
    await prisma.payoutRequest.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.settlement.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
