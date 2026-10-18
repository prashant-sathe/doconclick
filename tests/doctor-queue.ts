// Doctor queue order (BUG-TRACKER #24): /api/appointments/me returns the
// doctor's appointments soonest-first by visit time, "Next" skips visits
// that are already over, and those past SCHEDULED visits are what the
// dashboard asks the doctor to close (src/lib/doctorQueue.ts). The API part
// runs against a live dev server and the DB in .env, throwaway users only.
//
//   npm run test:doctor-queue
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { isOverdue, nextUpcoming, byVisitAsc, byVisitDesc, OVERDUE_GRACE_MS } from "../src/lib/doctorQueue";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const HOUR = 3600_000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  // ── Queue rules ──
  const now = Date.UTC(2026, 9, 18, 10, 0);
  const at = (h: number) => new Date(now + h * HOUR).toISOString();
  const lastWeek = { id: "lastWeek", status: "SCHEDULED", scheduledAt: at(-24 * 7) };
  const justStarted = { id: "justStarted", status: "SCHEDULED", scheduledAt: at(-0.25) };
  const graceEdge = { id: "graceEdge", status: "SCHEDULED", scheduledAt: new Date(now - OVERDUE_GRACE_MS).toISOString() };
  const later = { id: "later", status: "SCHEDULED", scheduledAt: at(3) };
  const pendingOld = { id: "pendingOld", status: "PENDING_APPROVAL", scheduledAt: at(-48) };

  check("a week-old scheduled visit is overdue", isOverdue(lastWeek, now), "overdue");
  check("a visit 15 min in (running late) is not", !isOverdue(justStarted, now), "not overdue");
  check("exactly at the grace boundary is not yet", !isOverdue(graceEdge, now), "not overdue");
  check("only SCHEDULED visits count", !isOverdue(pendingOld, now), "pending ignored");
  check("Next skips the stale visit", nextUpcoming([later, lastWeek, justStarted], now)?.id === "justStarted",
    `${nextUpcoming([later, lastWeek, justStarted], now)?.id}`);
  check("Next is nothing when only stale visits remain", nextUpcoming([lastWeek], now) === undefined, "undefined");
  check("asc / desc ordering", [later, lastWeek, justStarted].sort(byVisitAsc).map((a) => a.id).join() === "lastWeek,justStarted,later"
    && [later, lastWeek, justStarted].sort(byVisitDesc)[0].id === "later", "ok");

  // ── API order ──
  const stamp = String(Date.now()).slice(-8);
  const doctor = await prisma.user.create({ data: { name: "Queue Doctor", mobile: `1${stamp}5`, role: "DOCTOR", doctorProfile: { create: { status: "APPROVED" } } } });
  const patient = await prisma.user.create({ data: { name: "Queue Patient", mobile: `1${stamp}6`, role: "PATIENT" } });
  try {
    // Booked in the opposite order to their visit times.
    const offsets = [72, 5, -30, 24, 1];
    for (const h of offsets) {
      await prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctor.id, symptoms: `+${h}h`, consultType: "VIDEO", status: "SCHEDULED", scheduledAt: new Date(Date.now() + h * HOUR) },
      });
    }
    const cookie = `doconclick_token=${jwt.sign({ id: doctor.id, name: doctor.name, role: "DOCTOR", mobile: doctor.mobile, tv: 0 }, SECRET)}`;
    const list = (await (await fetch(`${BASE}/api/appointments/me`, { headers: { Cookie: cookie } })).json()) as { symptoms: string; scheduledAt: string }[];
    const order = list.map((a) => a.symptoms).join(",");
    check("API returns the doctor's appointments by visit time, soonest first", order === "+-30h,+1h,+5h,+24h,+72h", order);
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: doctor.id } });
    await prisma.user.deleteMany({ where: { id: { in: [doctor.id, patient.id] } } });
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
