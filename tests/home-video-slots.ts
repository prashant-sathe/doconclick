// HOME/VIDEO slot booking, patient reminder lead times and "Book again"
// (FP2-3): the slots API cuts the doctor's own Available Timings into the
// clinic 10-minute grid; the booking route and the patient reschedule only
// take those times (off-grid / outside hours refused, taken slot 409, racing
// requests → one booking, time off → no slots + 409, past the horizon → no
// slots), "book now" still works; the patient's reminder setting
// (PatientProfile.reminderLeadMinutes) is validated and drives one push per
// chosen lead time, never twice, starting over when the visit moves; the
// provider keeps their own ~1 hour reminder; the booking page takes the
// "Book again" prefill. Pure checks, then API checks against its own dev
// server (BASE_URL to use a running one) and the DB in .env, throwaway users
// only. Sweeps run with chosen clocks and are scoped to this suite's doctors;
// the users have no push tokens and Firebase is unset, so nothing reaches FCM.
//
//   npm run test:home-video-slots
import "dotenv/config";
import jwt from "jsonwebtoken";
import type { ChildProcess } from "child_process";
import { prisma } from "../src/lib/prisma";
import { doctorHoursSlotsForDate, snapToDoctorHours } from "../src/lib/doctorSlots";
import { normalizeReminderLeads, parseReminderLeads } from "../src/lib/appointmentReminderLeads";
import { sendDueAppointmentReminders } from "../src/lib/appointmentReminders";
import { getBookingHorizonDays } from "../src/lib/bookingLimits";
import { addDaysYmd, istDayKey } from "../src/lib/istDate";
import { startDevServer } from "./devServer";

// Never a real push from a test.
for (const k of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) process.env[k] = "";

let BASE = process.env.BASE_URL ?? "";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const MIN = 60_000, HOUR = 60 * MIN;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string; id?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: J = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const HOURS = "Mon, Tue, Wed, Thu, Fri, Sat, Sun 09:00–13:00";
const HOME_A = { lat: 18.5204, lng: 73.8567 };

function pureChecks() {
  const day = addDaysYmd(istDayKey(new Date()), 3);
  const slots = doctorHoursSlotsForDate(HOURS, day).map((s) => s.time);
  check("doctor hours → 10-minute grid 09:00…12:50", slots.length === 24 && slots[0] === "09:00" && slots[23] === "12:50", `${slots.length} slots, ${slots[0]}…${slots.at(-1)}`);
  check("no hours set → no slots", doctorHoursSlotsForDate(null, day).length === 0 && doctorHoursSlotsForDate("garbage", day).length === 0, "ok");
  const weekdays = doctorHoursSlotsForDate("Mon, Tue 09:00–10:00", "2026-11-01").length; // a Sunday
  check("a day the doctor doesn't work → no slots", weekdays === 0, `${weekdays}`);
  const at = (t: string) => new Date(`${day}T${t}:00+05:30`);
  const ok = snapToDoctorHours(HOURS, new Date(at("09:10").getTime() + 37_000));
  const off = snapToDoctorHours(HOURS, at("09:05"));
  const end = snapToDoctorHours(HOURS, at("13:00"));
  check("snapToDoctorHours: 09:10:37 → 09:10, 09:05 and 13:00 refused",
    ok.error === null && +ok.when === +at("09:10") && off.error !== null && end.error !== null, `${ok.when?.toISOString()} / ${off.error} / ${end.error}`);
  check("normalizeReminderLeads: [60,1440] → \"1440,60\", [] → \"\", \"30, 60\" → \"60,30\", [45] / {} → null",
    normalizeReminderLeads([60, 1440]) === "1440,60" && normalizeReminderLeads([]) === "" && normalizeReminderLeads("30, 60") === "60,30"
      && normalizeReminderLeads([45]) === null && normalizeReminderLeads({}) === null, "ok");
  check("parseReminderLeads drops unknown values", JSON.stringify(parseReminderLeads("60,7,abc,1440")) === "[1440,60]", JSON.stringify(parseReminderLeads("60,7,abc,1440")));
}

async function main() {
  pureChecks();

  let child: ChildProcess | null = null;
  if (!BASE) {
    const s = await startDevServer({ label: "fp23", env: { FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" } });
    child = s.child;
    BASE = s.base;
  }

  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (role: string, data: Record<string, unknown>): Promise<U> => {
    const u = await prisma.user.create({ data: { name: `HV Test ${role} ${++n}`, mobile: `5${String(n).padStart(2, "0")}${stamp}`.slice(0, 10), role, ...data } });
    ids.push(u.id);
    return u;
  };
  const docProfile = (extra: Record<string, unknown> = {}) => ({
    create: {
      status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 24 * HOUR), offersClinic: false,
      offersHomeVisit: true, offersVideo: true, homeVisitFee: 800, videoFee: 300, radius: 10, availability: HOURS, ...HOME_A, ...extra,
    },
  });
  const doctor = await mk("DOCTOR", { doctorProfile: docProfile() });
  const videoOnly = await mk("DOCTOR", { doctorProfile: docProfile({ offersHomeVisit: false }) });
  const patientProfile = () => ({ create: { age: 30, gender: "Female", homeAddress: "12 Old Lane, Pune", pinCode: "411001", ...HOME_A } });
  const patients: U[] = [];
  for (let i = 0; i < 10; i++) patients.push(await mk("PATIENT", { termsAcceptedAt: new Date(), patientProfile: patientProfile() }));
  const scope = { doctorIds: [doctor.id, videoOnly.id] };

  const day = addDaysYmd(istDayKey(new Date()), 3);
  const at = (d: string, t: string) => new Date(`${d}T${t}:00+05:30`);
  const book = (p: U, body: Record<string, unknown>, doctorId = doctor.id) =>
    call(p, "POST", "/api/appointments", { doctorId, symptoms: "fever and cough", consentGiven: true, ...body });
  const slotsOf = async (consultType: string, d: string, doctorId = doctor.id) => {
    const r = await call(patients[0], "GET", `/api/doctors/${doctorId}/slots?consultType=${consultType}&date=${d}`);
    return { status: r.status, away: r.json.away === true, times: ((r.json.slots as { time: string }[] | undefined) ?? []).map((s) => s.time) };
  };
  const inbox = (userId: string, kind: string) => prisma.notification.findMany({ where: { userId, kind }, orderBy: { createdAt: "asc" } });

  try {
    // ── Slots API ──
    let s = await slotsOf("VIDEO", day);
    check("slots API: VIDEO uses the doctor's hours (24 slots)", s.status === 200 && s.times.length === 24 && s.times[0] === "09:00", `${s.status} ${s.times.length}`);
    s = await slotsOf("HOME", day, videoOnly.id);
    check("slots API: HOME for a doctor who doesn't do home visits → 404", s.status === 404, `${s.status}`);
    const bad = await call(patients[0], "GET", `/api/doctors/${doctor.id}/slots?consultType=WALKIN&date=${day}`);
    check("slots API: unknown consult type without clinic → 400", bad.status === 400, `${bad.status}`);
    const beyond = addDaysYmd(istDayKey(new Date()), (await getBookingHorizonDays()) + 2);
    s = await slotsOf("VIDEO", beyond);
    check("slots API: past the booking horizon → no slots", s.status === 200 && s.times.length === 0, `${s.times.length}`);

    // P3-40: impossible dates → 400, past IST dates → empty, today/future unchanged.
    for (const badDate of ["9999-99-99", "2026-02-31"]) {
      const b = await slotsOf("VIDEO", badDate);
      check(`slots API: date ${badDate} → 400`, b.status === 400, `${b.status}`);
    }
    for (const past of [addDaysYmd(istDayKey(new Date()), -1), "2020-01-01"]) {
      const b = await slotsOf("VIDEO", past);
      check(`slots API: past date ${past} → 200, no slots`, b.status === 200 && b.times.length === 0, `${b.status} ${b.times.length}`);
    }

    // ── Booking a slot ──
    let r = await book(patients[0], { consultType: "VIDEO", scheduledAt: at(day, "09:00").toISOString() });
    check("VIDEO at 09:00 booked", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    const videoId = r.json.id!;
    s = await slotsOf("HOME", day);
    check("slots API hides 09:00 for HOME too (one doctor, one slot)", !s.times.includes("09:00") && s.times.includes("09:10"), `09:00 ${s.times.includes("09:00") ? "shown" : "hidden"}`);
    r = await book(patients[1], { consultType: "HOME", scheduledAt: at(day, "09:00").toISOString() });
    check("HOME at the taken 09:00 → 409", r.status === 409, `${r.status} ${r.json.error}`);
    r = await book(patients[1], { consultType: "HOME", scheduledAt: at(day, "09:05").toISOString() });
    check("HOME off the grid (09:05) → 400", r.status === 400 && /open slots/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    r = await book(patients[1], { consultType: "HOME", scheduledAt: at(day, "08:50").toISOString() });
    check("HOME outside the doctor's hours (08:50) → 400 OUTSIDE_HOURS", r.status === 400 && r.json.code === "OUTSIDE_HOURS", `${r.status} ${r.json.code}`);
    r = await book(patients[1], { consultType: "HOME", scheduledAt: at(day, "09:10").toISOString() });
    check("HOME at the free 09:10 booked", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // Eight patients race for one video slot.
    const racers = patients.slice(2, 10);
    const race = await Promise.all(racers.map((p) => book(p, { consultType: "VIDEO", scheduledAt: at(day, "11:00").toISOString() })));
    const wins = race.filter((x) => x.status === 200).length;
    const live = await prisma.appointment.count({ where: { doctorId: doctor.id, scheduledAt: at(day, "11:00"), status: { in: ["PENDING_APPROVAL", "SCHEDULED"] } } });
    check("8 concurrent VIDEO bookings of 11:00 → one booked", wins === 1 && live === 1 && race.every((x) => x.status === 200 || x.status === 409),
      `${wins}×200, ${race.filter((x) => x.status === 409).length}×409; live ${live}`);

    // "Book now" is unchanged — no slot, no grid.
    r = await book(patients[2], { consultType: "VIDEO" }, videoOnly.id);
    check("VIDEO \"book now\" still works", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // ── Time off ──
    const offDay = addDaysYmd(istDayKey(new Date()), 4);
    await prisma.providerTimeOff.create({ data: { providerId: doctor.id, startDate: offDay, endDate: offDay, reason: "test" } });
    s = await slotsOf("VIDEO", offDay);
    check("time off: slots API → away, no slots", s.away && s.times.length === 0, `away=${s.away} ${s.times.length}`);
    r = await book(patients[3], { consultType: "VIDEO", scheduledAt: at(offDay, "10:00").toISOString() });
    check("time off: booking that day → 409", r.status === 409, `${r.status} ${r.json.error}`);

    // ── Patient reschedule of a video visit ──
    r = await call(patients[0], "PATCH", `/api/appointments/${videoId}`, { scheduledAt: at(day, "12:05").toISOString() });
    const rOff = r.status;
    r = await call(patients[0], "PATCH", `/api/appointments/${videoId}`, { scheduledAt: at(day, "09:10").toISOString() });
    const rTaken = r.status;
    r = await call(patients[0], "PATCH", `/api/appointments/${videoId}`, { scheduledAt: at(day, "12:00").toISOString() });
    check("reschedule VIDEO: off-grid 400, onto the HOME slot 409, free slot 200", rOff === 400 && rTaken === 409 && r.status === 200, `${rOff}, ${rTaken}, ${r.status} ${r.json.error ?? ""}`);

    // ── Reminder setting ──
    const pr = patients[4];
    r = await call(pr, "PATCH", "/api/patients/me", { reminderLeadMinutes: [60, 1440, 30] });
    const stored = (await prisma.patientProfile.findUniqueOrThrow({ where: { userId: pr.id } })).reminderLeadMinutes;
    check("PATCH reminderLeadMinutes [60,1440,30] → \"1440,60,30\"", r.status === 200 && stored === "1440,60,30", `${r.status} ${stored}`);
    r = await call(pr, "PATCH", "/api/patients/me", { reminderLeadMinutes: [45] });
    check("PATCH an unknown lead → 400", r.status === 400 && /reminder/i.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    await call(pr, "PATCH", "/api/patients/me", { reminderLeadMinutes: [1440, 30] });
    const off = patients[5];
    r = await call(off, "PATCH", "/api/patients/me", { reminderLeadMinutes: [] });
    check("PATCH [] → reminders off (\"\")", r.status === 200 && (await prisma.patientProfile.findUniqueOrThrow({ where: { userId: off.id } })).reminderLeadMinutes === "", `${r.status}`);

    // ── Reminder sweep (clocks chosen; rows ~20 days ahead so the live 5-minute sweep never reaches them) ──
    const T = at(addDaysYmd(istDayKey(new Date()), 20), "10:00");
    const visit = (patientId: string, scheduledAt: Date, extra: Record<string, unknown> = {}) => prisma.appointment.create({
      data: { patientId, doctorId: doctor.id, symptoms: "reminder test", consultType: "VIDEO", status: "SCHEDULED", paymentMethod: "ONLINE", amount: 300, scheduledAt, ...extra },
    });
    const a = await visit(pr.id, T);
    const silent = await visit(off.id, new Date(T.getTime() + 20 * MIN));
    const plain = await visit(patients[6].id, new Date(T.getTime() + 40 * MIN)); // default setting: 1 hour

    await sendDueAppointmentReminders(new Date(T.getTime() - 24 * HOUR), scope);
    let got = await inbox(pr.id, "reminderPatientLead");
    check("1 day before → one patient reminder", got.length === 1 && /in about a day/.test(got[0]?.body ?? ""), `${got.length} "${got[0]?.body}"`);
    await Promise.all([1, 2].map(() => sendDueAppointmentReminders(new Date(T.getTime() - 24 * HOUR + 3 * MIN), scope)));
    got = await inbox(pr.id, "reminderPatientLead");
    check("two later sweeps in the same window → still one", got.length === 1, `${got.length}`);

    await sendDueAppointmentReminders(new Date(T.getTime() - 60 * MIN), scope);
    got = await inbox(pr.id, "reminderPatientLead");
    const docRem = await inbox(doctor.id, "reminderProvider");
    check("1 hour before: no patient push (not chosen), the doctor's own reminder goes out", got.length === 1 && docRem.length >= 1, `patient ${got.length}, doctor ${docRem.length}`);
    await sendDueAppointmentReminders(new Date(T.getTime() - 30 * MIN), scope);
    got = await inbox(pr.id, "reminderPatientLead");
    check("30 minutes before → second patient reminder", got.length === 2 && /in about 30 minutes/.test(got[1]?.body ?? ""), `${got.length} "${got[1]?.body}"`);

    await sendDueAppointmentReminders(new Date(silent.scheduledAt.getTime() - 24 * HOUR), scope);
    await sendDueAppointmentReminders(new Date(silent.scheduledAt.getTime() - 60 * MIN), scope);
    await sendDueAppointmentReminders(new Date(silent.scheduledAt.getTime() - 30 * MIN), scope);
    check("reminders off → no patient push", (await inbox(off.id, "reminderPatientLead")).length === 0, "none");
    await sendDueAppointmentReminders(new Date(plain.scheduledAt.getTime() - 60 * MIN), scope);
    got = await inbox(patients[6].id, "reminderPatientLead");
    check("default setting → the 1-hour reminder", got.length === 1 && /in about an hour/.test(got[0]?.body ?? ""), `${got.length} "${got[0]?.body}"`);

    // Moved (any path) → its reminders start over.
    const T2 = new Date(T.getTime() + 2 * 24 * HOUR);
    await prisma.appointment.update({ where: { id: a.id }, data: { scheduledAt: T2 } });
    await sendDueAppointmentReminders(new Date(T2.getTime() - 24 * HOUR), scope);
    check("moved visit → the 1-day reminder again", (await inbox(pr.id, "reminderPatientLead")).length === 3, `${(await inbox(pr.id, "reminderPatientLead")).length}`);

    // Confirmed late: 1 day and 2 hours both missed, 1 hour due → one push.
    const late = patients[7];
    await call(late, "PATCH", "/api/patients/me", { reminderLeadMinutes: [1440, 120, 60] });
    const lv = await visit(late.id, new Date(T.getTime() + 5 * 24 * HOUR));
    await sendDueAppointmentReminders(new Date(lv.scheduledAt.getTime() - 55 * MIN), scope);
    got = await inbox(late.id, "reminderPatientLead");
    check("visit confirmed 55 min ahead → only the 1-hour reminder", got.length === 1 && /in about an hour/.test(got[0]?.body ?? ""), `${got.length} "${got[0]?.body}"`);

    // Cancelled → nothing.
    const cv = await visit(patients[8].id, new Date(T.getTime() + 6 * 24 * HOUR), { status: "CANCELLED" });
    await sendDueAppointmentReminders(new Date(cv.scheduledAt.getTime() - 60 * MIN), scope);
    check("cancelled visit → no reminder", (await inbox(patients[8].id, "reminderPatientLead")).length === 0, "none");

    // Marathi push text.
    await prisma.user.update({ where: { id: patients[9].id }, data: { language: "mr-IN" } });
    const mv = await visit(patients[9].id, new Date(T.getTime() + 7 * 24 * HOUR));
    await sendDueAppointmentReminders(new Date(mv.scheduledAt.getTime() - 60 * MIN), scope);
    got = await inbox(patients[9].id, "reminderPatientLead");
    check("Marathi patient → Marathi reminder with Latin digits", got.length === 1 && /सुमारे एका तासात/.test(got[0]?.body ?? "") && !/[०-९]/.test(got[0]?.body ?? ""), `"${got[0]?.body}"`);

    // ── "Book again" prefill reaches the booking page ──
    const page = await fetch(`${BASE}/patient/book?doctorId=${doctor.id}&followUpOf=${videoId}&consultType=VIDEO&dependentId=x&relation=Son`, { headers: { Cookie: cookieFor(patients[0]) }, redirect: "manual" });
    check("/patient/book with the Book again prefill renders", page.status === 200, `${page.status}`);
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ doctorId: { in: ids } }, { patientId: { in: ids } }] } });
    await prisma.providerTimeOff.deleteMany({ where: { providerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    child?.kill();
  }
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
