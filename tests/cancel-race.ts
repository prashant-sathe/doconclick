// Concurrency test: racing cancels/declines of one paid appointment must
// refund it exactly once. Runs against a live dev server (npm run dev) and
// the DB in .env, using throwaway users that are deleted afterwards — no
// push tokens, no doctor profile (so no reassignment to a real doctor).
//
//   npm run test:cancel-race            (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.JWT_SECRET ?? "doconclick_super_secret_jwt_key_change_in_prod";
const PARALLEL = 8;
const FEE = 500;

type Actor = { cookie: string; body: Record<string, unknown> };

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-9);
  const doctor = await prisma.user.create({ data: { name: "Race Test Doctor", mobile: "7" + stamp, role: "DOCTOR" } });
  const patient = await prisma.user.create({ data: { name: "Race Test Patient", mobile: "6" + stamp, role: "PATIENT" } });
  const cookieFor = (u: typeof doctor) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile }, SECRET)}`;
  const asPatient: Actor = { cookie: cookieFor(patient), body: { status: "CANCELLED" } };
  const asDoctorCancel: Actor = { cookie: cookieFor(doctor), body: { status: "CANCELLED" } };
  const asDoctorReject: Actor = { cookie: cookieFor(doctor), body: { status: "REJECTED" } };

  const balance = async () => (await prisma.wallet.findUnique({ where: { userId: patient.id } }))?.balance ?? 0;

  async function race(label: string, status: string, actors: Actor[]) {
    const appt = await prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: doctor.id, symptoms: "race test", consultType: "VIDEO",
        status, paymentMethod: "ONLINE", paymentStatus: "PAID", amount: FEE,
        scheduledAt: new Date(Date.now() + 86400_000),
      },
    });
    const before = await balance();
    const statuses = await Promise.all(actors.map(async ({ cookie, body }) => {
      const r = await fetch(`${BASE}/api/appointments/${appt.id}`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.status;
    }));
    const credited = (await balance()) - before;
    const refundRows = await prisma.walletTransaction.count({ where: { refundOfAppointmentId: appt.id } });
    const wins = statuses.filter((s) => s === 200).length;
    const losersOk = statuses.every((s) => s === 200 || s === 400 || s === 409);
    const tally = Object.entries(statuses.reduce<Record<number, number>>((t, s) => ({ ...t, [s]: (t[s] ?? 0) + 1 }), {}))
      .map(([s, n]) => `${n}×${s}`).join(" ");
    check(label, wins === 1 && losersOk && credited === FEE && refundRows === 1,
      `responses ${tally}; wallet +₹${credited}; refund rows ${refundRows}`);
  }

  try {
    await race("patient ×8 cancel (SCHEDULED, paid)", "SCHEDULED", Array(PARALLEL).fill(asPatient));
    await race("doctor ×8 cancel (SCHEDULED, paid)", "SCHEDULED", Array(PARALLEL).fill(asDoctorCancel));
    await race("patient ×4 + doctor ×4 cancel", "SCHEDULED",
      Array.from({ length: PARALLEL }, (_, i) => (i % 2 ? asPatient : asDoctorCancel)));
    await race("doctor ×8 decline (PENDING_APPROVAL after reschedule, paid)", "PENDING_APPROVAL", Array(PARALLEL).fill(asDoctorReject));

    // The unique key is the last line of defence even if a code path skips the status claim.
    const appt = await prisma.appointment.findFirstOrThrow({ where: { patientId: patient.id } });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: patient.id } });
    const dup = await prisma.walletTransaction
      .create({ data: { walletId: wallet.id, type: "CANCELLATION_REFUND", amount: FEE, refundOfAppointmentId: appt.id } })
      .then(() => "created", (e: { code?: string }) => e.code ?? "error");
    check("second refund row for the same appointment", dup === "P2002", `insert → ${dup}`);
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
