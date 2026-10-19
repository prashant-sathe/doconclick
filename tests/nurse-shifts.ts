// Nurse shifts (BUG-TRACKER #41): the 1-hour lead time applies when a shift
// is rescheduled, not just booked; and the nurse clash check looks back far
// enough to see a 24h shift (+ travel buffer) that started yesterday — a
// fixed ±1 day window missed its last half hour. Against a live dev server
// and the DB in .env, throwaway users only.
//
//   npm run test:nurse-shifts
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { nursesBusyNow, nurseSlotProblem, NURSE_TRAVEL_BUFFER_MIN } from "../src/lib/nurseSchedule";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const fromNow = (ms: number) => new Date(Date.now() + ms);

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(u: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Cookie: cookieFor(u), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string } };
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `1${stamp}${n++}`, ...data } as never });
    ids.push(u.id);
    return u;
  };
  const HOME = { lat: 18.5204, lng: 73.8567 };
  const nurse = await mk({
    name: "Shift Nurse", role: "NURSE",
    nurseProfile: { create: { status: "APPROVED", ...HOME, radius: 10, availability: "Sun-Sat, 12AM-11:59PM", registrationFeePaid: true, subscriptionPaidUntil: fromNow(30 * DAY) } },
  });
  const patient = await mk({
    name: "Shift Patient", role: "PATIENT", termsAcceptedAt: new Date(),
    patientProfile: { create: { age: 70, gender: "Female", homeAddress: "9 Care Rd, Pune", pinCode: "411001", ...HOME } },
  });
  const shift = await prisma.nurseService.create({ data: { name: `Shift 24h ${stamp}`, kind: "SHIFT", durationMinutes: 24 * 60 } });
  const dressing = await prisma.nurseService.create({ data: { name: `Dressing ${stamp}`, durationMinutes: 30 } });
  const profile = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } });
  await prisma.nurseServiceOffering.createMany({ data: [
    { nurseProfileId: profile.id, serviceId: shift.id, price: 2000 },
    { nurseProfileId: profile.id, serviceId: dressing.id, price: 300 },
  ] });
  const confirmed = (service: { id: string; name: string }, scheduledAt: Date) => prisma.appointment.create({
    data: {
      doctorId: nurse.id, patientId: patient.id, providerType: "NURSE", consultType: "HOME", status: "SCHEDULED",
      nurseServiceId: service.id, serviceName: service.name, symptoms: service.name, amount: 300, paymentMethod: "CASH",
      createdAt: fromNow(-3 * DAY), scheduledAt,
    } as never,
  });

  try {
    // ── Clash: the tail of a 24h shift ──
    const shiftStart = fromNow(2 * DAY);
    const shiftEndWithTravel = shiftStart.getTime() + (24 * 60 + NURSE_TRAVEL_BUFFER_MIN) * MIN;
    await confirmed(shift, shiftStart);
    // 15 minutes before the shift + travel buffer ends, and the dressing itself
    // (30 + 30 min) can't fit before it does.
    const inTail = new Date(shiftEndWithTravel - 15 * MIN);
    let problem = await nurseSlotProblem({ nurseId: nurse.id, availability: null, when: inTail, durationMinutes: 30, viewer: "patient", checkHours: false });
    check("visit in the last half hour of a 24h shift → clash", !!problem, problem ?? "free (missed!)");
    problem = await nurseSlotProblem({ nurseId: nurse.id, availability: null, when: new Date(shiftStart.getTime() + 24 * 60 * MIN - 45 * MIN), durationMinutes: 30, viewer: "patient", checkHours: false });
    check("…and near the end of the shift itself → clash", !!problem, problem ?? "free");
    const r = await call(patient, "POST", "/api/nurse-bookings", { nurseId: nurse.id, serviceId: dressing.id, consentGiven: true, scheduledAt: inTail.toISOString() });
    check("booking a visit there via the API → 409 SLOT_UNAVAILABLE", r.status === 409 && r.json.code === "SLOT_UNAVAILABLE", `${r.status} ${r.json.error}`);
    const after = new Date(shiftEndWithTravel + 15 * MIN);
    problem = await nurseSlotProblem({ nurseId: nurse.id, availability: null, when: after, durationMinutes: 30, viewer: "patient", checkHours: false });
    check("after the shift + travel → free", problem === null, problem ?? "free");

    // ── "On a visit now" sees a shift that started over 24h ago ──
    const running = await confirmed(shift, fromNow(-(24 * 60 + 5) * MIN));
    const busy = await nursesBusyNow([nurse.id]);
    check("nurse in the 24h05m-old shift's travel tail → busy now", busy.has(nurse.id), busy.has(nurse.id) ? "busy" : "free (missed!)");
    await prisma.appointment.delete({ where: { id: running.id } });

    // ── Reschedule lead time for shifts ──
    const myShift = await confirmed(shift, fromNow(5 * DAY));
    let res = await call(patient, "PATCH", `/api/appointments/${myShift.id}`, { scheduledAt: fromNow(30 * MIN).toISOString() });
    check("reschedule a shift to 30 min from now → 400", res.status === 400 && (res.json.error ?? "").includes("at least an hour"), `${res.status} ${res.json.error}`);
    res = await call(patient, "PATCH", `/api/appointments/${myShift.id}`, { scheduledAt: fromNow(4 * DAY).toISOString() });
    check("reschedule a shift days ahead → 200", res.status === 200, `${res.status} ${res.json.error ?? ""}`);
    const myVisit = await confirmed(dressing, fromNow(DAY));
    res = await call(patient, "PATCH", `/api/appointments/${myVisit.id}`, { scheduledAt: fromNow(40 * MIN).toISOString() });
    check("an ordinary visit isn't bound by the shift lead time", !(res.json.error ?? "").includes("at least an hour"), `${res.status} ${res.json.error ?? ""}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.nursePackage.deleteMany({ where: { nurseId: nurse.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.nurseService.deleteMany({ where: { id: { in: [shift.id, dressing.id] } } });
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
