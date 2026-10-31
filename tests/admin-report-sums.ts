// Admin report totals summed in SQL (BUG-TRACKER P3-47): revenue-summary,
// revenue-by-consult-type, doctor-earnings and payment-collection must return
// exactly what the old load-every-row JS sums returned (kept below as the
// reference) — over the whole DB and over date ranges, with throwaway rows
// that carry the awkward cases: a legacy NaN / Infinity amount (must count as
// 0, not poison its group), sub-paisa amounts, a row with no paidAt (dated by
// its visit), an IST-midnight boundary and a payment-log type that's neither
// REGISTRATION nor SUBSCRIPTION. Starts its own dev server (BASE_URL to use a
// running one) against the DB in .env; throwaway rows dated 2001 are removed.
//
//   npm run test:report-sums
import "dotenv/config";
import jwt from "jsonwebtoken";
import type { ChildProcess } from "child_process";
import { prisma } from "../src/lib/prisma";
import { parseDateRange, safeNum } from "../src/lib/adminAuth";
import { paidInRange, effectivePaidAt } from "../src/lib/paidAt";
import { istDayKey } from "../src/lib/istDate";
import { money, sumMoney } from "../src/lib/money";
import { startDevServer } from "./devServer";

let BASE = process.env.BASE_URL ?? "";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type Range = { gte?: Date; lte?: Date };
const rangeOf = (qs: string): Range => {
  const r = parseDateRange(new URLSearchParams(qs));
  if (r.response) throw new Error(`bad range ${qs}`);
  return r.range;
};
const paidWhere = (range: Range) => ({ status: "COMPLETED", paymentStatus: "PAID", ...(range.gte || range.lte ? paidInRange(range) : {}) });

// ── The pre-P3-47 implementations (findMany + JS), as the reference ──
async function legacyRevenueSummary(range: Range) {
  const dateFilter = range.gte || range.lte ? range : undefined;
  const [appointments, doctorLogs, nurseLogs] = await Promise.all([
    prisma.appointment.findMany({ where: paidWhere(range), select: { amount: true, platformFee: true, discountAmount: true, paidAt: true, scheduledAt: true } }),
    prisma.doctorPaymentLog.findMany({ where: dateFilter ? { createdAt: dateFilter } : undefined, select: { type: true, amount: true, createdAt: true } }),
    prisma.nursePaymentLog.findMany({ where: dateFilter ? { createdAt: dateFilter } : undefined, select: { type: true, amount: true, createdAt: true } }),
  ]);
  const sum = (rows: { amount: number }[]) => sumMoney(rows.map((r) => r.amount));
  const grossConsultRevenue = sumMoney(appointments.map((a) => a.amount));
  const commissionBeforeCoupons = sumMoney(appointments.map((a) => a.platformFee));
  const couponDiscounts = sumMoney(appointments.map((a) => a.discountAmount));
  const platformCommission = sumMoney([commissionBeforeCoupons, -couponDiscounts]);
  const doctorNetPayout = sumMoney([grossConsultRevenue, -commissionBeforeCoupons]);
  const registrationRevenue = sum(doctorLogs.filter((l) => l.type === "REGISTRATION"));
  const subscriptionRevenue = sum(doctorLogs.filter((l) => l.type === "SUBSCRIPTION"));
  const nurseRegistrationRevenue = sum(nurseLogs.filter((l) => l.type === "REGISTRATION"));
  const nurseSubscriptionRevenue = sum(nurseLogs.filter((l) => l.type === "SUBSCRIPTION"));
  type Day = { date: string; consultRevenue: number; couponDiscounts: number; platformCommission: number; registrationRevenue: number; subscriptionRevenue: number; nurseRevenue: number };
  const byDay = new Map<string, Day>();
  const entry = (day: string) => {
    let e = byDay.get(day);
    if (!e) {
      e = { date: day, consultRevenue: 0, couponDiscounts: 0, platformCommission: 0, registrationRevenue: 0, subscriptionRevenue: 0, nurseRevenue: 0 };
      byDay.set(day, e);
    }
    return e;
  };
  for (const a of appointments) {
    const e = entry(istDayKey(effectivePaidAt(a)));
    e.consultRevenue += safeNum(a.amount);
    e.couponDiscounts += safeNum(a.discountAmount);
    e.platformCommission += safeNum(a.platformFee) - safeNum(a.discountAmount);
  }
  for (const l of doctorLogs) {
    const e = entry(istDayKey(l.createdAt));
    if (l.type === "REGISTRATION") e.registrationRevenue += safeNum(l.amount);
    else e.subscriptionRevenue += safeNum(l.amount);
  }
  for (const l of nurseLogs) entry(istDayKey(l.createdAt)).nurseRevenue += safeNum(l.amount);
  const rows = [...byDay.values()]
    .map((d) => ({
      date: d.date,
      consultRevenue: money(d.consultRevenue),
      couponDiscounts: money(d.couponDiscounts),
      platformCommission: money(d.platformCommission),
      registrationRevenue: money(d.registrationRevenue),
      subscriptionRevenue: money(d.subscriptionRevenue),
      nurseRevenue: money(d.nurseRevenue),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    summary: {
      grossConsultRevenue, commissionBeforeCoupons, couponDiscounts, platformCommission, doctorNetPayout,
      registrationRevenue, subscriptionRevenue, nurseRegistrationRevenue, nurseSubscriptionRevenue,
      totalPlatformEarnings: sumMoney([platformCommission, registrationRevenue, subscriptionRevenue, nurseRegistrationRevenue, nurseSubscriptionRevenue]),
    },
    rows,
  };
}

async function legacyByConsultType(range: Range) {
  const appointments = await prisma.appointment.findMany({ where: paidWhere(range), select: { consultType: true, amount: true, platformFee: true, discountAmount: true } });
  const byType = new Map<string, { bookingCount: number; grossRevenue: number; commissionBeforeCoupons: number; couponDiscounts: number }>();
  for (const a of appointments) {
    const e = byType.get(a.consultType) ?? { bookingCount: 0, grossRevenue: 0, commissionBeforeCoupons: 0, couponDiscounts: 0 };
    e.bookingCount += 1;
    e.grossRevenue += safeNum(a.amount);
    e.commissionBeforeCoupons += safeNum(a.platformFee);
    e.couponDiscounts += safeNum(a.discountAmount);
    byType.set(a.consultType, e);
  }
  const rows = [...byType.entries()]
    .map(([consultType, e]) => {
      const grossRevenue = money(e.grossRevenue), commissionBeforeCoupons = money(e.commissionBeforeCoupons), couponDiscounts = money(e.couponDiscounts);
      return {
        consultType, bookingCount: e.bookingCount, grossRevenue, commissionBeforeCoupons, couponDiscounts,
        platformCommission: sumMoney([commissionBeforeCoupons, -couponDiscounts]),
        doctorNetPayout: sumMoney([grossRevenue, -commissionBeforeCoupons]),
      };
    })
    .sort((a, b) => b.grossRevenue - a.grossRevenue);
  return { summary: { totalBookings: rows.reduce((s, r) => s + r.bookingCount, 0), totalRevenue: sumMoney(rows.map((r) => r.grossRevenue)) }, rows };
}

async function legacyDoctorEarnings(range: Range) {
  const appointments = await prisma.appointment.findMany({ where: paidWhere(range), select: { doctorId: true, amount: true, platformFee: true } });
  const byDoctor = new Map<string, { count: number; amount: number; platformFee: number }>();
  for (const a of appointments) {
    const e = byDoctor.get(a.doctorId) ?? { count: 0, amount: 0, platformFee: 0 };
    e.count += 1;
    e.amount += safeNum(a.amount);
    e.platformFee += safeNum(a.platformFee);
    byDoctor.set(a.doctorId, e);
  }
  const doctors = await prisma.user.findMany({
    where: { id: { in: [...byDoctor.keys()] } },
    select: { id: true, name: true, mobile: true, doctorProfile: { select: { specialty: true, avgRating: true, totalReviews: true, status: true } } },
  });
  const byId = new Map(doctors.map((d) => [d.id, d]));
  const rows = [...byDoctor.entries()]
    .map(([doctorId, g]) => {
      const d = byId.get(doctorId);
      const grossEarnings = money(g.amount);
      const platformFeePaid = money(g.platformFee);
      return {
        doctorId, doctorName: d?.name ?? "Unknown", doctorMobile: d?.mobile ?? null, specialty: d?.doctorProfile?.specialty ?? null,
        status: d?.doctorProfile?.status ?? null, avgRating: d?.doctorProfile?.avgRating ?? 0, totalReviews: d?.doctorProfile?.totalReviews ?? 0,
        completedBookings: g.count, grossEarnings, platformFeePaid, netEarnings: sumMoney([grossEarnings, -platformFeePaid]),
      };
    })
    .sort((a, b) => b.grossEarnings - a.grossEarnings);
  return {
    summary: { activeDoctors: rows.length, totalGrossEarnings: sumMoney(rows.map((r) => r.grossEarnings)), totalNetToDoctor: sumMoney(rows.map((r) => r.netEarnings)) },
    rows,
  };
}

async function legacyPaymentCollection(range: Range) {
  const where = range.gte || range.lte ? { createdAt: range } : {};
  const all = await prisma.appointment.findMany({ where, select: { paymentMethod: true, paymentStatus: true, amount: true } });
  const byGroup = new Map<string, { paymentMethod: string; paymentStatus: string; count: number; total: number }>();
  for (const a of all) {
    const key = `${a.paymentMethod}::${a.paymentStatus}`;
    const e = byGroup.get(key) ?? { paymentMethod: a.paymentMethod, paymentStatus: a.paymentStatus, count: 0, total: 0 };
    e.count += 1;
    e.total += safeNum(a.amount);
    byGroup.set(key, e);
  }
  const breakdown = [...byGroup.values()].map((b) => ({ ...b, total: money(b.total) }));
  return {
    onlineCollected: sumMoney(breakdown.filter((b) => b.paymentMethod === "ONLINE" && b.paymentStatus === "PAID").map((b) => b.total)),
    cashCollected: sumMoney(breakdown.filter((b) => b.paymentMethod === "CASH" && b.paymentStatus === "PAID").map((b) => b.total)),
    breakdown,
  };
}

// Order among equal values (ties) was never defined — compare as sets.
const sortBy = <T,>(rows: T[], key: (r: T) => string) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const diff = (a: unknown, b: unknown) => (same(a, b) ? "identical" : `old ${JSON.stringify(a)}\n      new ${JSON.stringify(b)}`);
const descending = (rows: Record<string, number>[], key: string) => rows.every((r, i) => i === 0 || rows[i - 1][key] >= r[key]);

async function main() {
  let child: ChildProcess | null = null;
  if (!BASE) {
    const started = await startDevServer({ label: "dev", env: { FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" } });
    child = started.child;
    BASE = started.base;
  }

  const stamp = String(Date.now()).slice(-7);
  let n = 0;
  const userIds: string[] = [];
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `8${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    userIds.push(u.id);
    return u;
  };
  const admin = await mk({ name: "Sums Admin", role: "ADMIN" });
  const cookie = `doconclick_token=${jwt.sign({ id: admin.id, name: admin.name, role: "ADMIN", mobile: admin.mobile, tv: 0 }, SECRET)}`;
  const get = async (path: string) => {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  try {
    const patient = await mk({ name: "Sums Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Female" } } });
    const d1 = await mk({ name: "Sums Doctor One", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED" } } });
    const d2 = await mk({ name: "Sums Doctor Two", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED" } } });
    const nurse = await mk({ name: "Sums Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });
    const at = (iso: string) => new Date(iso);
    const visit = (doctorId: string, data: Record<string, unknown>) =>
      prisma.appointment.create({ data: { patientId: patient.id, doctorId, symptoms: "P3-47-TEST", consultType: "CLINIC", status: "COMPLETED", paymentMethod: "ONLINE", paymentStatus: "PAID", ...data } as never });
    // 2001-03-01T18:45Z is 00:15 IST on 2 March — the day boundary.
    await visit(d1.id, { amount: 333.33, platformFee: 41.625, discountAmount: 12.345, paidAt: at("2001-03-01T18:45:00Z"), scheduledAt: at("2001-03-01T12:00:00Z"), createdAt: at("2001-03-01T09:00:00Z") });
    await visit(d1.id, { consultType: "VIDEO", paymentMethod: "CASH", amount: 500, platformFee: 62.5, paidAt: null, scheduledAt: at("2001-03-01T10:00:00Z"), createdAt: at("2001-03-01T09:00:00Z") });
    await visit(d1.id, { amount: NaN, platformFee: NaN, paidAt: at("2001-03-01T11:00:00Z"), scheduledAt: at("2001-03-01T11:00:00Z"), createdAt: at("2001-03-01T09:00:00Z") });
    await visit(d2.id, { consultType: "HOME", amount: 0.005, platformFee: Infinity, discountAmount: -12.345, paidAt: at("2001-03-05T10:00:00Z"), scheduledAt: at("2001-03-05T10:00:00Z"), createdAt: at("2001-03-05T09:00:00Z") });
    await visit(d2.id, { status: "SCHEDULED", paymentStatus: "PENDING", amount: 250, scheduledAt: at("2001-03-06T10:00:00Z"), createdAt: at("2001-03-05T09:00:00Z") });
    await visit(d2.id, { paymentMethod: "CASH", amount: 120.1, platformFee: 15.0125, paidAt: at("2001-03-05T10:00:00Z"), scheduledAt: at("2001-03-05T10:00:00Z"), createdAt: at("2001-03-05T09:00:00Z") });
    await prisma.doctorPaymentLog.createMany({
      data: [
        { doctorId: d1.id, type: "REGISTRATION", amount: 999.995, createdAt: at("2001-03-01T18:45:00Z") },
        { doctorId: d1.id, type: "SUBSCRIPTION", amount: 1499, createdAt: at("2001-03-01T10:00:00Z") },
        { doctorId: d1.id, type: "RENEWAL", amount: 10, createdAt: at("2001-03-01T10:00:00Z") },
        { doctorId: d2.id, type: "SUBSCRIPTION", amount: NaN, createdAt: at("2001-03-05T10:00:00Z") },
      ],
    });
    await prisma.nursePaymentLog.createMany({
      data: [
        { nurseId: nurse.id, type: "REGISTRATION", amount: 499.5, createdAt: at("2001-03-02T05:00:00Z") },
        { nurseId: nurse.id, type: "SUBSCRIPTION", amount: NaN, createdAt: at("2001-03-02T05:00:00Z") },
      ],
    });

    for (const qs of ["", "from=2001-03-01&to=2001-03-31", "from=2001-03-01&to=2001-03-01", "from=2001-03-02&to=2001-03-02", "to=2001-03-05"]) {
      const label = qs || "all time";
      const range = rangeOf(qs);
      const q = qs ? `?${qs}` : "";

      let r = await get(`/api/admin/reports/revenue-summary${q}`);
      const oldSummary = await legacyRevenueSummary(range);
      check(`revenue-summary [${label}] = old JS sums`, r.status === 200 && same(oldSummary, r.json), diff(oldSummary, r.json));

      r = await get(`/api/admin/reports/revenue-by-consult-type${q}`);
      const oldByType = await legacyByConsultType(range);
      check(`revenue-by-consult-type [${label}] = old JS sums`, r.status === 200 && same(oldByType.summary, r.json.summary)
        && same(sortBy(oldByType.rows, (x) => x.consultType), sortBy(r.json.rows ?? [], (x: { consultType: string }) => x.consultType)) && descending(r.json.rows, "grossRevenue"),
        diff(oldByType, r.json));

      r = await get(`/api/admin/reports/doctor-earnings${q}`);
      const oldEarnings = await legacyDoctorEarnings(range);
      check(`doctor-earnings [${label}] = old JS sums`, r.status === 200 && same(oldEarnings.summary, r.json.summary)
        && same(sortBy(oldEarnings.rows, (x) => x.doctorId), sortBy(r.json.rows ?? [], (x: { doctorId: string }) => x.doctorId)) && descending(r.json.rows, "grossEarnings"),
        diff(oldEarnings.summary, r.json.summary));

      r = await get(`/api/admin/reports/payment-collection${q}`);
      const oldPayments = await legacyPaymentCollection(range);
      const key = (b: { paymentMethod: string; paymentStatus: string }) => `${b.paymentMethod}::${b.paymentStatus}`;
      check(`payment-collection [${label}] = old JS sums`, r.status === 200 && r.json.summary?.onlineCollected === oldPayments.onlineCollected
        && r.json.summary?.cashCollected === oldPayments.cashCollected && same(sortBy(oldPayments.breakdown, key), sortBy(r.json.breakdown ?? [], key)),
        diff({ ...oldPayments, breakdown: sortBy(oldPayments.breakdown, key) }, { onlineCollected: r.json.summary?.onlineCollected, cashCollected: r.json.summary?.cashCollected, breakdown: sortBy(r.json.breakdown ?? [], key) }));
    }

    // The test rows on their own: the NaN visit counts, with ₹0, and doesn't zero its doctor.
    const march = await get("/api/admin/reports/doctor-earnings?from=2001-03-01&to=2001-03-31");
    const one = (march.json.rows ?? []).find((x: { doctorId: string }) => x.doctorId === d1.id);
    check("NaN visit: Doctor One keeps ₹833.33 gross over 3 completed visits", one?.grossEarnings === 833.33 && one?.completedBookings === 3, JSON.stringify(one));
    const day2 = (await get("/api/admin/reports/revenue-summary?from=2001-03-02&to=2001-03-02")).json;
    check("IST day: a payment at 00:15 IST lands on 2 March", day2.rows?.length === 1 && day2.rows[0].date === "2001-03-02" && day2.rows[0].consultRevenue === 333.33 && day2.rows[0].registrationRevenue === 1000 && day2.rows[0].nurseRevenue === 499.5, JSON.stringify(day2.rows));
    check("summary paise: 999.995 → ₹1,000, 41.625 → ₹41.63", day2.summary?.registrationRevenue === 1000 && day2.summary?.commissionBeforeCoupons === 41.63, JSON.stringify(day2.summary));
    const signedOut = await fetch(`${BASE}/api/admin/reports/revenue-summary`);
    check("signed out → 401", signedOut.status === 401, `${signedOut.status}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { symptoms: "P3-47-TEST", patientId: { in: userIds } } });
    await prisma.doctorPaymentLog.deleteMany({ where: { doctorId: { in: userIds } } });
    await prisma.nursePaymentLog.deleteMany({ where: { nurseId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    child?.kill();
  }

  console.log(`\n${failures ? `✗ ${failures} check(s) failed` : "✓ All checks passed"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
