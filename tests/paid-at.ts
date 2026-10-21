// paidAt (BUG-TRACKER #23): CASH completion sets it; revenue reports date
// rows without one by their visit instead of dropping them; and the one-off
// prisma/backfill-paid-at.ts fills it from the order / wallet payment / visit
// — exercised here only on throwaway rows via --only-ids, never the whole DB.
// Runs against a live dev server and the DB in .env.
//
//   npm run test:paid-at
import "dotenv/config";
import { execFileSync } from "child_process";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// A window no real booking falls in, so report totals are ours alone.
const day = (d: number, h = 6) => new Date(Date.UTC(2001, 0, d, h));

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const admin = await prisma.user.create({ data: { name: "PaidAt Admin", mobile: `1${stamp}0`, role: "ADMIN" } });
  const doctor = await prisma.user.create({
    data: { name: "PaidAt Doctor", mobile: `1${stamp}1`, role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 864e5 * 30) } } },
  });
  const patient = await prisma.user.create({ data: { name: "PaidAt Patient", mobile: `1${stamp}2`, role: "PATIENT" } });
  const ids = [admin.id, doctor.id, patient.id];
  const cookieFor = (u: { id: string; name: string; role: string; mobile: string }) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
  const appt = (data: Record<string, unknown>) =>
    prisma.appointment.create({
      data: { patientId: patient.id, doctorId: doctor.id, symptoms: "t", consultType: "CLINIC", amount: 500, platformFee: 50, ...data } as never,
    });

  try {
    // ── CASH completion sets paidAt ──
    const cash = await appt({ status: "SCHEDULED", paymentMethod: "CASH", scheduledAt: new Date(Date.now() - 3600_000) });
    const before = Date.now();
    const res = await fetch(`${BASE}/api/appointments/${cash.id}`, {
      method: "PATCH",
      headers: { Cookie: cookieFor(doctor), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    const done = await prisma.appointment.findUniqueOrThrow({ where: { id: cash.id } });
    check("CASH completion marks PAID with paidAt", res.status === 200 && done.paymentStatus === "PAID" && !!done.paidAt && done.paidAt.getTime() >= before - 1000,
      `${res.status} ${done.paymentStatus} ${done.paidAt?.toISOString()}`);

    // ── Reports fall back to the visit time ──
    const legacy = await appt({ status: "COMPLETED", paymentStatus: "PAID", paymentMethod: "CASH", scheduledAt: day(5), consultType: "VIDEO" });
    const paidInside = await appt({ status: "COMPLETED", paymentStatus: "PAID", paymentMethod: "ONLINE", scheduledAt: day(20), paidAt: day(6) });
    const paidOutside = await appt({ status: "COMPLETED", paymentStatus: "PAID", paymentMethod: "ONLINE", scheduledAt: day(5), paidAt: day(25) });
    const get = async (path: string) => (await fetch(`${BASE}${path}`, { headers: { Cookie: cookieFor(admin) } })).json();
    // Dates as the admin UI sends them: whole IST days (the fixtures sit at 11:30 IST, so their IST day is the UTC day).
    const range = "from=2001-01-01&to=2001-01-10";

    const summary = await get(`/api/admin/reports/revenue-summary?${range}`);
    check("revenue summary counts the no-paidAt row and dates by paidAt otherwise", summary.summary?.grossConsultRevenue === 1000,
      `gross ${summary.summary?.grossConsultRevenue} (want 2 × 500: legacy + paidInside, not paidOutside)`);
    const days = Object.fromEntries((summary.rows ?? []).map((r: { date: string; consultRevenue: number }) => [r.date, r.consultRevenue]));
    check("day buckets: legacy on its visit day, paid one on its paid day", days["2001-01-05"] === 500 && days["2001-01-06"] === 500, JSON.stringify(days));
    const byType = await get(`/api/admin/reports/revenue-by-consult-type?${range}`);
    const video = (byType.rows ?? []).find((r: { consultType: string }) => r.consultType === "VIDEO");
    check("by-consult-type includes the no-paidAt row", video?.bookingCount === 1, JSON.stringify(video));
    const earnings = await get(`/api/admin/reports/doctor-earnings?${range}`);
    const row = JSON.stringify(earnings).includes(doctor.id) || JSON.stringify(earnings).includes("PaidAt Doctor");
    check("doctor earnings includes this doctor in the window", row, row ? "listed" : "missing");
    void paidInside; void paidOutside;

    // ── Backfill script, scoped to throwaway rows ──
    const viaOrder = await appt({ status: "SCHEDULED", paymentStatus: "PAID", paymentMethod: "ONLINE", scheduledAt: day(15) });
    const order = await prisma.paymentOrder.create({
      data: { orderId: `paidat_${stamp}`, patientId: patient.id, amount: 500, status: "PAID", settledAt: day(14, 9), items: { create: { appointmentId: viaOrder.id, amount: 500, outcome: "APPLIED" } } },
    });
    const viaWallet = await appt({ status: "COMPLETED", paymentStatus: "PAID", paymentMethod: "ONLINE", scheduledAt: day(16) });
    const wallet = await prisma.wallet.create({ data: { userId: patient.id, balance: 0 } });
    const wtx = await prisma.walletTransaction.create({ data: { walletId: wallet.id, type: "BOOKING_PAYMENT", amount: 500, status: "SUCCESS", appointmentId: viaWallet.id } });
    const future = await appt({ status: "SCHEDULED", paymentStatus: "PAID", paymentMethod: "ONLINE", scheduledAt: new Date(Date.now() + 864e5 * 3) });
    const targets = [legacy.id, viaOrder.id, viaWallet.id, future.id];

    const run = (...args: string[]) =>
      execFileSync("npx", ["tsx", "prisma/backfill-paid-at.ts", `--only-ids=${targets.join(",")}`, ...args], { encoding: "utf8" });
    const dry = run();
    const stillNull = await prisma.appointment.count({ where: { id: { in: targets }, paidAt: null } });
    check("dry run changes nothing", stillNull === 4 && /Dry run/.test(dry) && /ORDER 1, WALLET 1, VISIT 2/.test(dry), dry.split("\n")[1]);

    const out = run("--apply");
    const after = Object.fromEntries((await prisma.appointment.findMany({ where: { id: { in: targets } }, select: { id: true, paidAt: true } }))
      .map((a) => [a.id, a.paidAt?.toISOString()]));
    check("ORDER source → order settledAt", after[viaOrder.id] === day(14, 9).toISOString(), `${after[viaOrder.id]}`);
    check("WALLET source → wallet payment time", after[viaWallet.id] === wtx.createdAt.toISOString(), `${after[viaWallet.id]}`);
    check("VISIT source → visit time", after[legacy.id] === day(5).toISOString(), `${after[legacy.id]}`);
    check("VISIT in the future → capped at now", !!after[future.id] && new Date(after[future.id]!).getTime() <= Date.now(), `${after[future.id]}`);
    check("apply reports what it wrote", /Wrote paidAt on 4 appointment/.test(out), out.trim().split("\n").pop() ?? "");

    await prisma.appointment.update({ where: { id: legacy.id }, data: { paidAt: day(2) } });
    run("--apply");
    const kept = await prisma.appointment.findUniqueOrThrow({ where: { id: legacy.id } });
    check("re-run never overwrites an existing paidAt", kept.paidAt?.toISOString() === day(2).toISOString(), `${kept.paidAt?.toISOString()}`);
    void order;
  } finally {
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: patient.id } } });
    await prisma.wallet.deleteMany({ where: { userId: patient.id } });
    await prisma.paymentOrder.deleteMany({ where: { patientId: patient.id } });
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
