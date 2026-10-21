// Slot double-booking test: clinic times must sit on the slot grid, a timed
// booking holds the doctor across all their clinics and consult types, and
// create / accept / bulk-accept / reschedule all refuse overlaps — with the
// partial unique index on live (doctorId, scheduledAt) as the backstop for
// racing requests. Runs against a live dev server and the DB in .env with
// throwaway users (no push tokens) that are deleted afterwards.
//
//   npm run test:slots                  (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { isSlotIndexViolation } from "../src/lib/doctorSlots";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

const day = new Date(Date.now() + 3 * 86400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const at = (hhmm: string, sec = 0) => new Date(new Date(`${day}T${hhmm}:00+05:30`).getTime() + sec * 1000);
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  const mkDoctor = async (n: number) => {
    const u = await prisma.user.create({
      data: {
        name: `Slot Test Doctor ${n}`, mobile: `7${n}${stamp}`, role: "DOCTOR",
        doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 86_400_000), offersClinic: true, offersVideo: true, consultFee: 300, videoFee: 200,
          // Any day: the booking day is "today + 3", which can be a weekend, and video times must be within the doctor's hours.
          availability: "Sun-Sat, 12AM-11:59PM" } },
      },
    });
    ids.push(u.id);
    return u;
  };
  const doc1 = await mkDoctor(1);
  const doc2 = await mkDoctor(2);
  const patients: { id: string; name: string; role: string; mobile: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const p = await prisma.user.create({
      data: { name: `Slot Test Patient ${i}`, mobile: `6${i}${stamp}`, role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 30, gender: "Other" } } },
    });
    ids.push(p.id);
    patients.push(p);
  }
  const cookie = (u: { id: string; name: string; role: string; mobile: string }) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile }, SECRET)}`;
  const mkClinic = (doctorId: string, name: string) => prisma.clinic.create({
    data: { doctorId, name, address: "-", lat: 0, lng: 0, slots: { create: WEEK.map((d) => ({ dayOfWeek: d, fromTime: "08:00", toTime: "20:00" })) } },
  });
  const clinicA = await mkClinic(doc1.id, "Slot Test Clinic A");
  const clinicB = await mkClinic(doc1.id, "Slot Test Clinic B");

  const book = async (p: (typeof patients)[number], body: Record<string, unknown>) => {
    const r = await fetch(`${BASE}/api/appointments`, {
      method: "POST",
      headers: { cookie: cookie(p), "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId: doc1.id, symptoms: "slot test", consentGiven: true, ...body }),
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, error: data.error as string | undefined, id: data.id as string | undefined, scheduledAt: data.scheduledAt as string | undefined };
  };
  const patch = async (who: string, id: string, body: unknown) => {
    const r = await fetch(`${BASE}/api/appointments/${id}`, { method: "PATCH", headers: { cookie: who, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, error: (await r.json().catch(() => ({}))).error as string | undefined };
  };
  const clinicVisit = (clinicId: string, when: Date) => ({ consultType: "CLINIC", clinicId, scheduledAt: when.toISOString() });

  try {
    // 1. Grid: off-grid minute refused, stray seconds snapped
    const off = await book(patients[0], clinicVisit(clinicA.id, at("10:05")));
    check("off-grid clinic time refused", off.status === 400, `${off.status} ${off.error}`);
    const ok = await book(patients[0], clinicVisit(clinicA.id, at("10:00", 37)));
    check("seconds snapped onto the 10:00 slot", ok.status === 200 && ok.scheduledAt === at("10:00").toISOString(), `${ok.status} → ${ok.scheduledAt}`);

    // 2. Overlap across clinics and consult types; adjacent slot is fine
    const otherClinic = await book(patients[1], clinicVisit(clinicB.id, at("10:00")));
    check("same time at another clinic refused", otherClinic.status === 409, `${otherClinic.status} ${otherClinic.error}`);
    const video = await book(patients[1], { consultType: "VIDEO", scheduledAt: at("10:05").toISOString() });
    check("overlapping video call refused", video.status === 409, `${video.status} ${video.error}`);
    const adjacent = await book(patients[1], { consultType: "VIDEO", scheduledAt: at("10:10").toISOString() });
    check("back-to-back video at 10:10 allowed", adjacent.status === 200, `${adjacent.status} ${adjacent.error ?? ""}`);

    // 3. Slots API reflects doctor-wide bookings
    const slots: string[] = (await fetch(`${BASE}/api/doctors/${doc1.id}/slots?clinicId=${clinicB.id}&date=${day}`, { headers: { cookie: cookie(patients[2]) } })
      .then((r) => r.json())).slots.map((s: { time: string }) => s.time);
    check("clinic B hides 10:00 (clinic A) and 10:10 (video)", !slots.includes("10:00") && !slots.includes("10:10") && slots.includes("10:20"),
      `10:00 ${slots.includes("10:00") ? "shown" : "hidden"}, 10:10 ${slots.includes("10:10") ? "shown" : "hidden"}, 10:20 ${slots.includes("10:20") ? "shown" : "hidden"}`);

    // 4. Eight patients race for one slot
    const race = await Promise.all(patients.map((p) => book(p, clinicVisit(clinicA.id, at("11:00")))));
    const wins = race.filter((r) => r.status === 200).length;
    const live = await prisma.appointment.count({ where: { doctorId: doc1.id, scheduledAt: at("11:00"), status: { in: ["PENDING_APPROVAL", "SCHEDULED"] } } });
    check("8 concurrent bookings of 11:00 → one booked", wins === 1 && race.every((r) => r.status === 200 || r.status === 409) && live === 1,
      `${wins}×200, ${race.filter((r) => r.status === 409).length}×409; live rows ${live}`);

    // 5. Accept refuses an overlap with a confirmed slot (rows inserted directly, as if they predate these checks)
    const DOC2 = cookie(doc2);
    const base = { doctorId: doc2.id, symptoms: "slot test", consultType: "VIDEO", paymentMethod: "ONLINE", amount: 200 };
    const p1 = await prisma.appointment.create({ data: { ...base, patientId: patients[0].id, scheduledAt: at("14:00") } });
    const p2 = await prisma.appointment.create({ data: { ...base, patientId: patients[1].id, scheduledAt: at("14:05") } });
    const acc1 = await patch(DOC2, p1.id, { status: "SCHEDULED" });
    const acc2 = await patch(DOC2, p2.id, { status: "SCHEDULED" });
    check("accept 14:00 ok, overlapping 14:05 refused", acc1.status === 200 && acc2.status === 409, `${acc1.status}, ${acc2.status} ${acc2.error}`);

    // 6. Bulk-accept: timed overlaps stay pending, "book now" requests are a queue and all go through
    await prisma.appointment.delete({ where: { id: p2.id } });
    const q = [at("15:00"), at("15:05"), at("15:30")];
    for (const [i, t] of q.entries()) await prisma.appointment.create({ data: { ...base, patientId: patients[i].id, scheduledAt: t } });
    const nowish = Date.now() - 60_000;
    for (const i of [3, 4]) {
      const t = new Date(nowish + i); // "book now": scheduledAt === createdAt
      await prisma.appointment.create({ data: { ...base, patientId: patients[i].id, scheduledAt: t, createdAt: t } });
    }
    const bulk = await fetch(`${BASE}/api/appointments/bulk-accept`, { method: "POST", headers: { cookie: DOC2 } }).then((r) => r.json());
    const stillPending = await prisma.appointment.findMany({ where: { doctorId: doc2.id, status: "PENDING_APPROVAL" }, select: { scheduledAt: true } });
    check("bulk-accept: 4 accepted, 15:05 left pending", bulk.count === 4 && bulk.skipped?.length === 1 && stillPending.length === 1 && +stillPending[0].scheduledAt === +at("15:05"),
      `accepted ${bulk.count}, skipped ${bulk.skipped?.length}; pending ${stillPending.map((p) => p.scheduledAt.toISOString().slice(11, 16)).join(",")}Z`);

    // 7. Reschedule: grid + doctor-wide overlap
    const r = await prisma.appointment.create({
      data: { doctorId: doc1.id, patientId: patients[5].id, symptoms: "slot test", consultType: "CLINIC", clinicId: clinicA.id, status: "SCHEDULED", paymentMethod: "ONLINE", amount: 300, scheduledAt: at("16:00") },
    });
    const PAT = cookie(patients[5]);
    const rOff = await patch(PAT, r.id, { scheduledAt: at("16:05").toISOString() });
    const rTaken = await patch(PAT, r.id, { scheduledAt: at("10:10").toISOString() });
    const rFree = await patch(PAT, r.id, { scheduledAt: at("16:30").toISOString() });
    check("reschedule: off-grid 400, onto video slot 409, free slot 200", rOff.status === 400 && rTaken.status === 409 && rFree.status === 200,
      `${rOff.status}, ${rTaken.status} (${rTaken.error}), ${rFree.status}`);

    // 8. The index itself: a second live row at the same start is rejected; a cancelled one isn't counted
    const dup = await prisma.appointment
      .create({ data: { ...base, doctorId: doc1.id, patientId: patients[6].id, scheduledAt: at("10:00") } })
      .then(() => "created", (e) => (isSlotIndexViolation(e) ? "slot index violation" : `other error ${e?.code}`));
    const cancelledOk = await prisma.appointment
      .create({ data: { ...base, doctorId: doc1.id, patientId: patients[6].id, scheduledAt: at("10:00"), status: "CANCELLED" } })
      .then(() => "created", (e) => `error ${e?.code}`);
    check("partial unique index", dup === "slot index violation" && cancelledOk === "created", `live duplicate → ${dup}; cancelled duplicate → ${cancelledOk}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: { in: [doc1.id, doc2.id] } } });
    await prisma.clinic.deleteMany({ where: { doctorId: doc1.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
