// P3-23: a nurse can't accept a pending home-visit request whose time is
// already past the visit-start window. The lazy expiry sweep expires it even
// when it was created minutes ago (the 30-min createdAt rule alone missed it),
// the patient is refunded + notified, and a recent/within-window request is
// still acceptable. Live dev server + DB in .env, throwaway users.
//
//   npm run test:nurse-accept-expired   (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { VISIT_START_LATE_MS } from "../src/lib/nursePackage";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const FEE = 400;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-9);
  const patient = await prisma.user.create({ data: { name: "Expired Test Patient", mobile: "6" + stamp, role: "PATIENT" } });
  const nurse = await prisma.user.create({
    data: { name: "Expired Test Nurse", mobile: "9" + stamp, role: "NURSE", nurseProfile: { create: { status: "APPROVED", isVerified: true } } },
  });
  const cookie = `doconclick_token=${jwt.sign({ id: nurse.id, name: nurse.name, role: nurse.role, mobile: nurse.mobile }, SECRET)}`;
  const accept = async (id: string) => {
    const r = await fetch(`${BASE}/api/appointments/${id}`, {
      method: "PATCH", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ status: "SCHEDULED" }),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const mk = (scheduledAt: Date, paid: boolean) => prisma.appointment.create({
    data: {
      patientId: patient.id, doctorId: nurse.id, providerType: "NURSE", symptoms: "expired test", consultType: "HOME",
      status: "PENDING_APPROVAL", paymentMethod: "ONLINE", paymentStatus: paid ? "PAID" : "PENDING", amount: FEE, scheduledAt,
    },
  });

  try {
    // Created just now, scheduled 2 days ago: the createdAt rule alone wouldn't expire it.
    const old = await mk(new Date(Date.now() - 2 * 86400_000), false);
    const r1 = await accept(old.id);
    const row1 = await prisma.appointment.findUniqueOrThrow({ where: { id: old.id } });
    check("accept 2-day-old pending request", r1.status === 409 && row1.status === "EXPIRED", `HTTP ${r1.status}, status ${row1.status}`);

    // Paid one (e.g. rescheduled then never confirmed): refunded once through the expiry path.
    const paid = await mk(new Date(Date.now() - VISIT_START_LATE_MS - 60_000), true);
    const r2 = await accept(paid.id);
    const row2 = await prisma.appointment.findUniqueOrThrow({ where: { id: paid.id } });
    const refunds = await prisma.walletTransaction.count({ where: { refundOfAppointmentId: paid.id } });
    check("paid request past the window is expired + refunded", r2.status === 409 && row2.status === "EXPIRED" && refunds === 1, `HTTP ${r2.status}, ${row2.status}, ${refunds} refund row(s)`);

    // Slightly late but inside the start window: still acceptable.
    const ok = await mk(new Date(Date.now() - 60 * 60_000), false);
    const r3 = await accept(ok.id);
    check("accept 1h-late request (inside window)", r3.status === 200, `HTTP ${r3.status} ${r3.body?.error ?? ""}`);

    // Future request: unaffected.
    const fut = await mk(new Date(Date.now() + 86400_000), false);
    const r4 = await accept(fut.id);
    check("accept future request", r4.status === 200, `HTTP ${r4.status} ${r4.body?.error ?? ""}`);
  } finally {
    const ids = [patient.id, nurse.id];
    const appts = await prisma.appointment.findMany({ where: { patientId: patient.id }, select: { id: true } });
    await prisma.walletTransaction.deleteMany({ where: { refundOfAppointmentId: { in: appts.map((a) => a.id) } } });
    await prisma.appointment.deleteMany({ where: { patientId: patient.id } });
    await prisma.wallet.deleteMany({ where: { userId: patient.id } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log("\nAll checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
