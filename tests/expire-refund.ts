// Expiry refund test: a paid appointment the patient rescheduled (back to
// PENDING_APPROVAL) that the provider never re-confirmed must be refunded
// exactly once when it expires — even when several requests run the lazy
// expiry sweep at the same moment. Runs against a live dev server and the DB
// in .env with throwaway users (no push tokens) that are deleted afterwards.
//
//   npm run test:expire-refund          (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const PARALLEL = 8;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-9);
  const doctor = await prisma.user.create({ data: { name: "Expire Test Doctor", mobile: "7" + stamp, role: "DOCTOR" } });
  const patient = await prisma.user.create({ data: { name: "Expire Test Patient", mobile: "6" + stamp, role: "PATIENT" } });
  const cookie = `doconclick_token=${jwt.sign({ id: patient.id, name: patient.name, role: "PATIENT", mobile: patient.mobile }, SECRET)}`;

  const hourAgo = new Date(Date.now() - 3600_000);
  const base = { patientId: patient.id, doctorId: doctor.id, symptoms: "expire test", consultType: "VIDEO", paymentMethod: "ONLINE", createdAt: new Date(Date.now() - 86400_000) };
  try {
    // Accepted + paid ₹600 with a ₹100 coupon, then rescheduled to a time that has now passed unconfirmed.
    const paid = await prisma.appointment.create({ data: { ...base, status: "PENDING_APPROVAL", paymentStatus: "PAID", amount: 600, discountAmount: 100, scheduledAt: hourAgo } });
    // Distinct start times: live bookings of one doctor can't share one (partial unique index).
    const unpaid = await prisma.appointment.create({ data: { ...base, status: "PENDING_APPROVAL", paymentStatus: "PENDING", amount: 500, scheduledAt: new Date(hourAgo.getTime() + 60_000) } });
    const live = await prisma.appointment.create({ data: { ...base, status: "SCHEDULED", paymentStatus: "PAID", amount: 500, scheduledAt: new Date(hourAgo.getTime() + 120_000) } });

    const statuses = await Promise.all(Array.from({ length: PARALLEL }, () =>
      fetch(`${BASE}/api/appointments/me`, { headers: { cookie } }).then((r) => r.status)));
    check(`${PARALLEL} concurrent sweeps`, statuses.every((s) => s === 200), `responses ${statuses.join(",")}`);

    const rows = await prisma.appointment.findMany({ where: { id: { in: [paid.id, unpaid.id, live.id] } }, select: { id: true, status: true } });
    const statusOf = (id: string) => rows.find((r) => r.id === id)?.status;
    const wallet = await prisma.wallet.findUnique({ where: { userId: patient.id } });
    const refunds = await prisma.walletTransaction.findMany({ where: { refundOfAppointmentId: { in: [paid.id, unpaid.id, live.id] } } });

    check("paid rescheduled row expired", statusOf(paid.id) === "EXPIRED", `status ${statusOf(paid.id)}`);
    check("refunded once, net of coupon", wallet?.balance === 500 && refunds.length === 1 && refunds[0].refundOfAppointmentId === paid.id && refunds[0].type === "CANCELLATION_REFUND",
      `wallet ₹${wallet?.balance ?? 0}; refund rows ${refunds.length} (${refunds.map((r) => `${r.type} ₹${r.amount}`).join(", ")})`);
    check("unpaid row expired without refund", statusOf(unpaid.id) === "EXPIRED" && !refunds.some((r) => r.refundOfAppointmentId === unpaid.id), `status ${statusOf(unpaid.id)}`);
    check("SCHEDULED row untouched", statusOf(live.id) === "SCHEDULED", `status ${statusOf(live.id)}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { patientId: patient.id } });
    await prisma.user.delete({ where: { id: patient.id } });
    await prisma.user.delete({ where: { id: doctor.id } });
    await prisma.$disconnect();
  }
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
