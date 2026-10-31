import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { money, sumMoney } from "@/lib/money";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin, parseDateRange } from "@/lib/adminAuth";

// GET: platform-wide revenue — consultations (doctor and nurse visits) plus
// doctor and nurse registration/subscription fees — as a total summary and a
// day-by-day breakdown (days are IST calendar days).
//
// Coupons: the platform absorbs a coupon's discount. The patient pays
// `amount - discountAmount`, but the provider's payout and `platformFee` are
// still worked out on the full `amount` — so what the platform actually
// earns on a visit is `platformFee - discountAmount`. `platformCommission`
// below is that net figure; `commissionBeforeCoupons` is the raw fee, which
// is what the provider owes (doctorNetPayout = gross - commissionBeforeCoupons).
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const parsedRange = parseDateRange(searchParams);
  if (parsedRange.response) return parsedRange.response;
  const range = parsedRange.range;

  // Summed in SQL per IST day (P3-47) instead of loading every row. Per day
  // the plain sum, rounded on the way out (as before); for the summary each
  // row in paise, like sumMoney (src/lib/money.ts). A legacy NaN/Infinity
  // amount counts as 0, like safeNum.
  const dayOf = (col: Prisma.Sql) => Prisma.sql`to_char((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
  const inRange = (col: Prisma.Sql) => Prisma.sql`${range.gte ? Prisma.sql`AND ${col} >= ${range.gte}::timestamp` : Prisma.empty} ${range.lte ? Prisma.sql`AND ${col} <= ${range.lte}::timestamp` : Prisma.empty}`;
  const finite = (col: string) => Prisma.sql`CASE WHEN ${Prisma.raw(col)} IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8) THEN 0 ELSE ${Prisma.raw(col)} END`;
  const sums = (col: string, as: string) => Prisma.sql`COALESCE(SUM(${finite(col)}), 0)::float8 AS ${Prisma.raw(`"${as}"`)}, COALESCE(SUM(ROUND(${finite(col)}::numeric * 100)), 0)::float8 AS ${Prisma.raw(`"${as}Paise"`)}`;
  // Rows without paidAt (older ones) are dated by their visit instead of
  // silently dropping out of every date range (src/lib/paidAt.ts).
  const visitAt = Prisma.sql`COALESCE("paidAt", "scheduledAt")`;
  type Sums<K extends string> = { [P in K | `${K}Paise`]: number };
  type LogDay = { day: string; type: string } & Sums<"amount">;
  const logDays = (table: string) => prisma.$queryRaw<LogDay[]>`
    SELECT ${dayOf(Prisma.sql`"createdAt"`)} AS day, type, ${sums('"amount"', "amount")}
    FROM ${Prisma.raw(`"${table}"`)} WHERE TRUE ${inRange(Prisma.sql`"createdAt"`)}
    GROUP BY 1, 2`;
  const [visitDays, doctorLogs, nurseLogs] = await Promise.all([
    prisma.$queryRaw<({ day: string } & Sums<"amount" | "platformFee" | "discountAmount">)[]>`
      SELECT ${dayOf(visitAt)} AS day, ${sums('"amount"', "amount")}, ${sums('"platformFee"', "platformFee")}, ${sums('"discountAmount"', "discountAmount")}
      FROM "Appointment" WHERE status = 'COMPLETED' AND "paymentStatus" = 'PAID' ${inRange(visitAt)}
      GROUP BY 1`,
    logDays("DoctorPaymentLog"),
    logDays("NursePaymentLog"),
  ]);

  // Derived figures come from the rounded parts, so the summary always adds up.
  const paise = (rows: Record<string, unknown>[], key: string) => rows.reduce((t, r) => t + Number(r[key]), 0) / 100;
  const ofType = (rows: LogDay[], type: string) => rows.filter((l) => l.type === type);
  const grossConsultRevenue = paise(visitDays, "amountPaise");
  const commissionBeforeCoupons = paise(visitDays, "platformFeePaise");
  const couponDiscounts = paise(visitDays, "discountAmountPaise");
  const platformCommission = sumMoney([commissionBeforeCoupons, -couponDiscounts]);
  const doctorNetPayout = sumMoney([grossConsultRevenue, -commissionBeforeCoupons]);
  const registrationRevenue = paise(ofType(doctorLogs, "REGISTRATION"), "amountPaise");
  const subscriptionRevenue = paise(ofType(doctorLogs, "SUBSCRIPTION"), "amountPaise");
  const nurseRegistrationRevenue = paise(ofType(nurseLogs, "REGISTRATION"), "amountPaise");
  const nurseSubscriptionRevenue = paise(ofType(nurseLogs, "SUBSCRIPTION"), "amountPaise");

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
  for (const v of visitDays) {
    const e = entry(v.day);
    e.consultRevenue += v.amount;
    e.couponDiscounts += v.discountAmount;
    e.platformCommission += v.platformFee - v.discountAmount;
  }
  for (const l of doctorLogs) {
    const e = entry(l.day);
    if (l.type === "REGISTRATION") e.registrationRevenue += l.amount;
    else e.subscriptionRevenue += l.amount;
  }
  for (const l of nurseLogs) entry(l.day).nurseRevenue += l.amount;

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

  return NextResponse.json({
    summary: {
      grossConsultRevenue,
      commissionBeforeCoupons,
      couponDiscounts,
      platformCommission,
      doctorNetPayout,
      registrationRevenue,
      subscriptionRevenue,
      nurseRegistrationRevenue,
      nurseSubscriptionRevenue,
      totalPlatformEarnings:
        sumMoney([platformCommission, registrationRevenue, subscriptionRevenue, nurseRegistrationRevenue, nurseSubscriptionRevenue]),
    },
    rows,
  });
}
