// Admin doctor/patient drawer stats (BUG-TRACKER #22): computed over every
// appointment (not the 10 shown), doctor earnings net of the platform's
// commission (amount − platformFee, completed visits), patient spend net of
// coupon discounts, and a legacy NaN amount row can't zero the totals.
// Runs against a live dev server and the DB in .env, throwaway users only.
//
//   npm run test:admin-stats
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 24 * 60 * 60 * 1000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const admin = await prisma.user.create({ data: { name: "Stats Admin", mobile: `2${stamp}0`, role: "ADMIN" } });
  const doctor = await prisma.user.create({ data: { name: "Stats Doctor", mobile: `2${stamp}1`, role: "DOCTOR", doctorProfile: { create: { status: "APPROVED" } } } });
  const patient = await prisma.user.create({ data: { name: "Stats Patient", mobile: `2${stamp}2`, role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } } });
  const ids = [admin.id, doctor.id, patient.id];

  let i = 0;
  const appt = (data: Record<string, unknown>) =>
    prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: doctor.id, symptoms: "t", consultType: "VIDEO", amount: 500, platformFee: 50,
        scheduledAt: new Date(Date.now() - 30 * DAY + ++i * 60 * 60_000), ...data,
      } as never,
    });

  try {
    // 12 completed (more than the 10 the drawer lists), 3 with a ₹100 coupon.
    for (let k = 0; k < 12; k++) await appt({ status: "COMPLETED", paymentStatus: "PAID", discountAmount: k < 3 ? 100 : 0 });
    await appt({ status: "CANCELLED" });
    await appt({ status: "CANCELLED" });
    await appt({ status: "NO_SHOW" });
    await appt({ status: "PENDING_APPROVAL", scheduledAt: new Date(Date.now() + DAY) });
    await appt({ status: "SCHEDULED", scheduledAt: new Date(Date.now() + 2 * DAY) });
    // A legacy bad row: counted, but kept out of the money.
    await appt({ status: "COMPLETED", amount: NaN, platformFee: NaN });

    const cookie = `doconclick_token=${jwt.sign({ id: admin.id, name: admin.name, role: "ADMIN", mobile: admin.mobile, tv: 0 }, SECRET)}`;
    const get = async (path: string) => (await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } })).json();

    const d = await get(`/api/admin/doctors/${doctor.id}`);
    const ds = d.stats;
    check("doctor: counts over all appointments", ds.completedCount === 13 && ds.cancelledCount === 2 && ds.noShowCount === 1
      && ds.pendingCount === 1 && ds.scheduledCount === 1 && ds.totalCount === 18, JSON.stringify({ c: ds.completedCount, t: ds.totalCount }));
    check("doctor: still lists only the 10 most recent", d.asDoctor.length === 10, `${d.asDoctor.length}`);
    check("doctor: net earnings = amount − platformFee over completed", ds.grossEarnings === 6000 && ds.platformFees === 600 && ds.totalEarnings === 5400,
      `gross ${ds.grossEarnings}, fee ${ds.platformFees}, net ${ds.totalEarnings}`);

    const p = await get(`/api/admin/patients/${patient.id}`);
    const ps = p.stats;
    check("patient: counts over all appointments", ps.completedCount === 13 && ps.cancelledCount === 2 && ps.totalCount === 18, JSON.stringify({ c: ps.completedCount, t: ps.totalCount }));
    check("patient: spend is what they paid (fee − coupon)", ps.totalSpent === 5700 && ps.couponSavings === 300, `spent ${ps.totalSpent}, savings ${ps.couponSavings}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: doctor.id } });
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
