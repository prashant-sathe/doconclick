// Settlement idempotency test: concurrent "Settle" requests for one doctor
// must produce exactly one settlement covering each appointment once, a
// repeated idempotency key must return that same settlement, and totals must
// come from exactly the claimed rows. Only ever settles a throwaway doctor
// (with a throwaway admin), all deleted afterwards — never real dues. Runs
// against a live dev server and the DB in .env.
//
//   npm run test:settlements            (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.JWT_SECRET ?? "doconclick_super_secret_jwt_key_change_in_prod";
const PARALLEL = 8;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-9);
  const admin = await prisma.user.create({ data: { name: "Settle Test Admin", mobile: "5" + stamp, role: "ADMIN" } });
  const doctor = await prisma.user.create({ data: { name: "Settle Test Doctor", mobile: "7" + stamp, role: "DOCTOR" } });
  const patient = await prisma.user.create({ data: { name: "Settle Test Patient", mobile: "6" + stamp, role: "PATIENT" } });
  const cookie = `doconclick_token=${jwt.sign({ id: admin.id, name: admin.name, role: "ADMIN", mobile: admin.mobile }, SECRET)}`;

  let n = 0;
  // Completed + paid dues: ONLINE ₹500 (fee ₹50) → ₹450 owed to the doctor; CASH ₹300 (fee ₹30) → ₹30 owed by them.
  const due = (paymentMethod: "ONLINE" | "CASH", amount: number) => prisma.appointment.create({
    data: {
      patientId: patient.id, doctorId: doctor.id, symptoms: "settle test", consultType: "VIDEO",
      status: "COMPLETED", paymentStatus: "PAID", paymentMethod, amount, platformFee: amount / 10,
      scheduledAt: new Date(Date.now() - 86400_000 - ++n * 60_000),
    },
  });
  const settle = async (body: Record<string, unknown>) => {
    const r = await fetch(`${BASE}/api/admin/finance/settlements`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId: doctor.id, ...body }),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const settlements = () => prisma.settlement.findMany({ where: { doctorId: doctor.id }, include: { _count: { select: { appointments: true } } }, orderBy: { createdAt: "asc" } });

  try {
    // 1. Racing settles without a key (two tabs): exactly one settlement, every row once
    for (let i = 0; i < 3; i++) await due("ONLINE", 500);
    await due("CASH", 300);
    const race = await Promise.all(Array.from({ length: PARALLEL }, () => settle({})));
    let rows = await settlements();
    const wins = race.filter((r) => r.status === 200).length;
    check(`${PARALLEL} concurrent settles → one settlement`,
      wins === 1 && rows.length === 1 && rows[0]._count.appointments === 4 && rows[0].netAmount === 1320 && rows[0].onlineCount === 3 && rows[0].cashCount === 1,
      `${wins}×200, ${race.filter((r) => r.status === 400).length}×400; settlements ${rows.length}, rows ${rows[0]?._count.appointments}, net ₹${rows[0]?.netAmount}`);

    // 2. Same idempotency key fired repeatedly (double-click / retry): one settlement, same id every time
    await due("ONLINE", 500);
    const key = `test-${stamp}-a`;
    const dup = await Promise.all(Array.from({ length: PARALLEL }, () => settle({ idempotencyKey: key })));
    rows = await settlements();
    const ids = new Set(dup.map((r) => r.body.id));
    check("same key ×8 → all 200, one settlement id", dup.every((r) => r.status === 200) && ids.size === 1 && rows.length === 2 && rows[1]._count.appointments === 1 && rows[1].netAmount === 450,
      `${dup.map((r) => r.status).join(",")}; distinct ids ${ids.size}; settlements ${rows.length}, replays ${dup.filter((r) => r.body.replayed).length}`);
    const later = await settle({ idempotencyKey: key });
    check("retrying a finished key later replays it", later.status === 200 && later.body.replayed === true && later.body.id === [...ids][0], `${later.status}, replayed ${later.body.replayed}`);

    // 3. Negative net needs acknowledgement; the refused attempt claims nothing and leaves no settlement behind
    await due("CASH", 300);
    const key2 = `test-${stamp}-b`;
    const ask = await settle({ idempotencyKey: key2 });
    const unclaimed = await prisma.appointment.count({ where: { doctorId: doctor.id, settlementId: null } });
    rows = await settlements();
    check("negative net → 409 requiresAcknowledgement, nothing claimed", ask.status === 409 && ask.body.requiresAcknowledgement === true && ask.body.netAmount === -30 && unclaimed === 1 && rows.length === 2,
      `${ask.status}, net ₹${ask.body.netAmount}; unclaimed rows ${unclaimed}; settlements ${rows.length}`);
    const ack = await settle({ idempotencyKey: key2, acknowledgeNegative: true });
    rows = await settlements();
    check("acknowledged with the same key → settled once", ack.status === 200 && rows.length === 3 && rows[2].netAmount === -30 && rows[2].idempotencyKey === key2,
      `${ack.status}; settlements ${rows.length}, net ₹${rows[2]?.netAmount}`);

    // 4. Nothing left to settle
    const empty = await settle({ idempotencyKey: `test-${stamp}-c` });
    check("nothing pending → 400, no empty settlement", empty.status === 400 && (await settlements()).length === 3, `${empty.status} ${empty.body.error}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: doctor.id } });
    await prisma.settlement.deleteMany({ where: { doctorId: doctor.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, doctor.id, patient.id] } } });
    await prisma.$disconnect();
  }
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
