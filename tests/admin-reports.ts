// Admin reports + dashboard (BUG-TRACKER #48): bad from/to is a 400, ranges
// and day keys are IST days, nurse fees are in the revenue summary, platform
// earnings are net of the coupon discounts the platform absorbs, and the
// dashboard skips soft-deleted users and counts nurses. Pure checks, then API
// checks against a live dev server and the DB in .env, throwaway rows only
// (dated in 2031 so real data can't be in the range).
//
//   npm run test:admin-reports
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { isValidYmd, istDayKey, istStartOfDay, istEndOfDay } from "../src/lib/istDate";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function get(as: U, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookieFor(as) } });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; rows?: Record<string, unknown>[]; summary?: Record<string, number> } };
}
const near = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 0.005;

async function main() {
  // ── IST helpers ──
  check("isValidYmd: real dates", isValidYmd("2026-10-21") && isValidYmd("2028-02-29"), "ok");
  check("isValidYmd: rejects 2026-02-31, month 13, garbage, wrong shape", !isValidYmd("2026-02-31") && !isValidYmd("2026-13-01") && !isValidYmd("not-a-date") && !isValidYmd("2026-1-5") && !isValidYmd("2026-10-21T00:00:00Z"), "ok");
  check("a payment at 00:30 IST on 1 Apr is 1 Apr (UTC key says 31 Mar)", istDayKey(new Date("2031-03-31T19:00:00Z")) === "2031-04-01", istDayKey(new Date("2031-03-31T19:00:00Z")));
  check("23:30 IST on 31 Mar is 31 Mar", istDayKey(new Date("2031-03-31T18:00:00Z")) === "2031-03-31", "ok");
  check("IST day bounds", istStartOfDay("2031-04-01").toISOString() === "2031-03-31T18:30:00.000Z" && istEndOfDay("2031-04-01").toISOString() === "2031-04-01T18:29:59.999Z", `${istStartOfDay("2031-04-01").toISOString()} … ${istEndOfDay("2031-04-01").toISOString()}`);

  // ── Fixtures ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `9${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const admin = await mk({ name: "Reports Admin", role: "ADMIN" });
  const doctor = await mk({ name: "Reports Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 864e5) } } });
  const patient = await mk({ name: "Reports Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const nurse = await mk({ name: "Reports Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });

  const completed = (paidAt: string, over: Record<string, unknown>) => prisma.appointment.create({
    data: {
      doctorId: doctor.id, patientId: patient.id, status: "COMPLETED", paymentStatus: "PAID", consultType: "VIDEO", symptoms: "fever",
      amount: 1000, platformFee: 150, discountAmount: 60, paymentMethod: "ONLINE", paidAt: new Date(paidAt), scheduledAt: new Date(paidAt), ...over,
    } as never,
  });
  const APR1 = "2031-04-01", MAR31 = "2031-03-31";
  try {
    // 00:30 IST on 1 Apr (= 31 Mar 19:00 UTC): a coupon booking — fee 150, ₹60 absorbed.
    await completed("2031-03-31T19:00:00Z", {});
    // 23:30 IST on 31 Mar: a plain booking, no coupon.
    await completed("2031-03-31T18:00:00Z", { amount: 400, platformFee: 40, discountAmount: 0, consultType: "CLINIC" });
    // 23:59:30 IST on 1 Apr: inside 1 Apr. 00:00:30 IST on 2 Apr: outside it.
    await completed("2031-04-01T18:29:30Z", { amount: 200, platformFee: 20, discountAmount: 0, consultType: "HOME" });
    await completed("2031-04-01T18:30:30Z", { amount: 9000, platformFee: 900, discountAmount: 0, consultType: "HOME" });
    // Fees paid by providers, 1 Apr IST.
    await prisma.doctorPaymentLog.create({ data: { doctorId: doctor.id, type: "REGISTRATION", amount: 300, createdAt: new Date("2031-03-31T20:00:00Z") } });
    await prisma.nursePaymentLog.createMany({ data: [
      { nurseId: nurse.id, type: "REGISTRATION", amount: 500, createdAt: new Date("2031-03-31T20:00:00Z") },
      { nurseId: nurse.id, type: "SUBSCRIPTION", amount: 200, createdAt: new Date("2031-04-01T05:00:00Z") },
    ] });

    // ── Date validation: every endpoint that takes a range ──
    const endpoints = ["revenue-summary", "revenue-by-consult-type", "appointments", "payment-collection", "prescriptions", "doctor-earnings", "subscription-payments"]
      .map((r) => `/api/admin/reports/${r}`).concat("/api/admin/finance/settlements/history");
    let bad = 0, good = 0;
    for (const ep of endpoints) {
      for (const q of ["from=garbage", "to=2026-02-31", "from=2026-13-01", "from=2026-10-21T00:00:00Z", "from=2031-04-02&to=2031-04-01"]) {
        const r = await get(admin, `${ep}?${q}`);
        if (r.status === 400 && typeof r.json.error === "string") bad++;
        else console.log(`  ${ep}?${q} → ${r.status}`);
      }
      if ((await get(admin, `${ep}?from=2031-04-01&to=2031-04-01`)).status === 200) good++;
    }
    check(`${endpoints.length} endpoints × 5 bad ranges → all 400 with a message`, bad === endpoints.length * 5, `${bad}/${endpoints.length * 5}`);
    check("…and a valid range still → 200 on each", good === endpoints.length, `${good}/${endpoints.length}`);
    const msg = (await get(admin, "/api/admin/reports/revenue-summary?from=garbage")).json.error;
    check("the message says what's wrong", msg === "Invalid 'from' date — use YYYY-MM-DD.", String(msg));
    check("a patient can't read reports (403)", (await get(patient, "/api/admin/reports/revenue-summary")).status === 403, "ok");

    // ── IST ranges and day keys ──
    const day1 = await get(admin, `/api/admin/reports/revenue-summary?from=${APR1}&to=${APR1}`);
    check("1 Apr (IST) holds the 00:30 and 23:59:30 payments, not the 23:30 on 31 Mar or 00:00:30 on 2 Apr", near(day1.json.summary?.grossConsultRevenue, 1200), `gross ${day1.json.summary?.grossConsultRevenue}`);
    check("…grouped under 1 Apr, not 31 Mar", day1.json.rows?.length === 1 && day1.json.rows[0].date === APR1, JSON.stringify(day1.json.rows?.map((r) => r.date)));
    const day0 = await get(admin, `/api/admin/reports/revenue-summary?from=${MAR31}&to=${MAR31}`);
    check("31 Mar (IST) holds only the 23:30 payment", near(day0.json.summary?.grossConsultRevenue, 400) && day0.json.rows?.[0]?.date === MAR31, `gross ${day0.json.summary?.grossConsultRevenue}`);
    const both = await get(admin, `/api/admin/reports/revenue-summary?from=${MAR31}&to=${APR1}`);
    check("two-day range: rows for both IST days, newest first", both.json.rows?.map((r) => r.date).join() === `${APR1},${MAR31}`, both.json.rows?.map((r) => r.date).join() ?? "");

    // ── Coupons and nurse fees ──
    const s = day1.json.summary ?? {};
    check("platform commission is net of the ₹60 coupon discount (150 + 20 − 60)", near(s.commissionBeforeCoupons, 170) && near(s.couponDiscounts, 60) && near(s.platformCommission, 110), `before ${s.commissionBeforeCoupons} · coupons ${s.couponDiscounts} · net ${s.platformCommission}`);
    check("provider payout unchanged by coupons (1200 − 170)", near(s.doctorNetPayout, 1030), `${s.doctorNetPayout}`);
    check("nurse registration + subscription fees included", near(s.nurseRegistrationRevenue, 500) && near(s.nurseSubscriptionRevenue, 200), `${s.nurseRegistrationRevenue} / ${s.nurseSubscriptionRevenue}`);
    check("…and the doctor fee", near(s.registrationRevenue, 300), `${s.registrationRevenue}`);
    check("total platform earnings = net commission + all four fee streams (110 + 300 + 500 + 200)", near(s.totalPlatformEarnings, 1110), `${s.totalPlatformEarnings}`);
    const row = day1.json.rows?.[0] ?? {};
    check("daily row carries the same figures", near(row.platformCommission as number, 110) && near(row.couponDiscounts as number, 60) && near(row.nurseRevenue as number, 700), JSON.stringify(row));

    const byType = await get(admin, `/api/admin/reports/revenue-by-consult-type?from=${APR1}&to=${APR1}`);
    const video = byType.json.rows?.find((r) => r.consultType === "VIDEO") ?? {};
    check("by consult type: VIDEO commission net of coupons, payout on the raw fee", near(video.platformCommission as number, 90) && near(video.couponDiscounts as number, 60) && near(video.doctorNetPayout as number, 850), JSON.stringify(video));

    // ── Dashboard ──
    const before = (await get(admin, "/api/admin/analytics")).json as Record<string, number>;
    const extraPatient = await mk({ name: "Dash Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
    const extraNurse = await mk({ name: "Dash Nurse", role: "NURSE", nurseProfile: { create: { status: "PENDING" } } });
    const extraDoctor = await mk({ name: "Dash Doctor", role: "DOCTOR", doctorProfile: { create: { status: "PENDING" } } });
    const withNew = (await get(admin, "/api/admin/analytics")).json as Record<string, number>;
    check("new patient, doctor and nurse are counted", withNew.totalPatients === before.totalPatients + 1 && withNew.totalDoctors === before.totalDoctors + 1 && withNew.totalNurses === before.totalNurses + 1, `${withNew.totalPatients - before.totalPatients} / ${withNew.totalDoctors - before.totalDoctors} / ${withNew.totalNurses - before.totalNurses}`);
    check("pending nurse and pending doctor are counted", withNew.pendingNurses === before.pendingNurses + 1 && withNew.pendingDoctors === before.pendingDoctors + 1, `${withNew.pendingNurses - before.pendingNurses} / ${withNew.pendingDoctors - before.pendingDoctors}`);
    await prisma.user.updateMany({ where: { id: { in: [extraPatient.id, extraNurse.id, extraDoctor.id] } }, data: { deletedAt: new Date() } });
    const afterDelete = (await get(admin, "/api/admin/analytics")).json as Record<string, number>;
    check("after soft-deleting them they're not counted any more", afterDelete.totalPatients === before.totalPatients && afterDelete.totalDoctors === before.totalDoctors && afterDelete.totalNurses === before.totalNurses, `${afterDelete.totalPatients - before.totalPatients} / ${afterDelete.totalDoctors - before.totalDoctors} / ${afterDelete.totalNurses - before.totalNurses}`);
    check("…nor their pending approvals", afterDelete.pendingNurses === before.pendingNurses && afterDelete.pendingDoctors === before.pendingDoctors, `${afterDelete.pendingNurses - before.pendingNurses} / ${afterDelete.pendingDoctors - before.pendingDoctors}`);
    check("dashboard platform earnings = commission − coupons, and ours are in it", near(afterDelete.totalPlatformEarnings, afterDelete.totalPlatformFee - afterDelete.totalCouponDiscounts) && afterDelete.totalCouponDiscounts >= 60, `${afterDelete.totalPlatformEarnings} = ${afterDelete.totalPlatformFee} − ${afterDelete.totalCouponDiscounts}`);
  } finally {
    await prisma.doctorPaymentLog.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.nursePaymentLog.deleteMany({ where: { nurseId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
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
