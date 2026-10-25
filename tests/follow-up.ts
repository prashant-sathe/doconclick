// Follow-up scheduling (BUG-TRACKER F13): the doctor sets "review in N days"
// (+ a short note) when completing a consultation, or changes / clears it
// later via PATCH /api/appointments/[id] — only on their own COMPLETED visit,
// only a future date within the booking horizon. The patient sees it on
// their appointment; another patient and another doctor don't. The reminder
// sweep (sendDueFollowUpReminders) sends one localized inbox notification
// once per appointment, and skips it when the patient already rebooked or
// the account is gone. Against a live dev server and the DB in .env,
// throwaway users only; they have no push tokens, so nothing reaches FCM.
//
//   npm run test:follow-up   (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { sendDueFollowUpReminders } from "../src/lib/appointmentReminders";
import { getBookingHorizonDays } from "../src/lib/bookingLimits";
import { followUpYmdIn, followUpInstant } from "../src/lib/followUp";

// Never a real push from a test.
for (const k of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) delete process.env[k];

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const HOUR = 3600e3, DAY = 24 * HOUR;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: J = {};
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function main() {
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `6${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const profile = { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY) } };
  const doctor = await mk({ name: "Follow Doctor", role: "DOCTOR", doctorProfile: profile });
  const other = await mk({ name: "Other Follow Doctor", role: "DOCTOR", doctorProfile: profile });
  const desk = await mk({ name: "Follow Desk", role: "STAFF" });
  await prisma.staffProfile.create({ data: { userId: desk.id, doctorId: doctor.id } });
  const patient = await mk({ name: "Follow Patient", role: "PATIENT", password: "x", language: "mr-IN", patientProfile: { create: { age: 30, gender: "Male" } } });
  const stranger = await mk({ name: "Stranger Patient", role: "PATIENT", password: "x", patientProfile: { create: { age: 31, gender: "Female" } } });

  const visit = (extra: Record<string, unknown> = {}) =>
    prisma.appointment.create({ data: { patientId: patient.id, doctorId: doctor.id, symptoms: "FOLLOWUP-TEST", consultType: "CLINIC", status: "SCHEDULED", paymentMethod: "CASH", amount: 400, scheduledAt: new Date(Date.now() - HOUR), ...extra } });
  const row = (id: string) => prisma.appointment.findUniqueOrThrow({ where: { id } });
  const complete = (as: U, id: string, followUp: unknown) =>
    call(as, "POST", `/api/appointments/${id}/complete`, { medicines: [{ name: "Paracetamol 500" }], followUp });
  const NOTE = `Bring CBC report ${stamp}`;
  const horizon = await getBookingHorizonDays();

  try {
    // ── Set on complete; bad input refuses before anything is written ──
    const a = await visit();
    let r = await complete(doctor, a.id, { date: followUpYmdIn(0), note: "" });
    check("follow-up today → 400 INVALID_FOLLOW_UP", r.status === 400 && r.json.code === "INVALID_FOLLOW_UP", `${r.status} ${r.json.error}`);
    r = await complete(doctor, a.id, { date: followUpYmdIn(-3) });
    check("follow-up in the past → 400", r.status === 400, `${r.status}`);
    r = await complete(doctor, a.id, { date: followUpYmdIn(horizon + 1) });
    check(`follow-up beyond the ${horizon}-day horizon → 400`, r.status === 400 && /at most/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    r = await complete(doctor, a.id, { date: "2026-02-31" });
    check("not a real date → 400", r.status === 400, `${r.status}`);
    r = await complete(doctor, a.id, { date: followUpYmdIn(7), note: "x".repeat(201) });
    check("note over 200 chars → 400", r.status === 400, `${r.status}`);
    check("…visit still open, nothing saved", (await row(a.id)).status === "SCHEDULED" && (await row(a.id)).followUpDate === null, "untouched");

    r = await complete(doctor, a.id, { date: followUpYmdIn(7), note: `  ${NOTE}  ` });
    let saved = await row(a.id);
    check("complete with a 7-day follow-up → 200", r.status === 200 && saved.status === "COMPLETED", `${r.status} ${r.json.error ?? ""}`);
    check("…stored as that IST day + trimmed note", saved.followUpDate?.getTime() === followUpInstant(followUpYmdIn(7)).getTime() && saved.followUpNote === NOTE, `${saved.followUpDate?.toISOString()} "${saved.followUpNote}"`);
    const plain = await visit();
    r = await call(doctor, "POST", `/api/appointments/${plain.id}/complete`, { medicines: [{ name: "ORS" }] });
    check("complete without followUp → none set", r.status === 200 && (await row(plain.id)).followUpDate === null, `${r.status}`);

    // ── Who sees it ──
    const mine = await call(patient, "GET", `/api/appointments/me`);
    const card = (mine.json as unknown as { id: string; followUpDate?: string; followUpNote?: string }[]).find?.((x) => x.id === a.id);
    check("patient's list shows the follow-up date and note", !!card && card.followUpNote === NOTE && !!card.followUpDate, `${mine.status} ${card?.followUpDate}`);
    r = await call(stranger, "GET", `/api/appointments/${a.id}`);
    check("another patient can't open it → 404, no note", r.status === 404 && !r.text.includes(NOTE), `${r.status}`);
    r = await call(other, "GET", `/api/appointments/${a.id}`);
    check("another doctor can't open it → 404", r.status === 404 && !r.text.includes(NOTE), `${r.status}`);
    r = await call(other, "GET", `/api/doctors/patients/${patient.id}`);
    check("another doctor's view of the patient has no note", !r.text.includes(NOTE), `${r.status}`);

    // ── Change / clear later (PATCH) ──
    r = await call(other, "PATCH", `/api/appointments/${a.id}`, { followUp: { date: followUpYmdIn(14) } });
    check("another doctor → 403", r.status === 403, `${r.status}`);
    r = await call(desk, "PATCH", `/api/appointments/${a.id}`, { followUp: { date: followUpYmdIn(14) } });
    check("the doctor's front desk → 403", r.status === 403, `${r.status} ${r.json.error}`);
    r = await call(patient, "PATCH", `/api/appointments/${a.id}`, { followUp: { date: followUpYmdIn(14) } });
    check("the patient → 4xx, unchanged", r.status >= 400 && r.status < 500 && (await row(a.id)).followUpDate?.getTime() === saved.followUpDate?.getTime(), `${r.status}`);
    const open = await visit();
    r = await call(doctor, "PATCH", `/api/appointments/${open.id}`, { followUp: { date: followUpYmdIn(14) } });
    check("on a not-yet-completed visit → 409 NOT_COMPLETED", r.status === 409 && r.json.code === "NOT_COMPLETED", `${r.status} ${r.json.code}`);
    r = await call(doctor, "PATCH", `/api/appointments/${a.id}`, { followUp: { date: followUpYmdIn(0) } });
    check("change to today → 400", r.status === 400, `${r.status}`);
    r = await call(doctor, "PATCH", `/api/appointments/${a.id}`, { followUp: { date: followUpYmdIn(14), note: "" } });
    saved = await row(a.id);
    check("change to 14 days, note removed → 200", r.status === 200 && saved.followUpDate?.getTime() === followUpInstant(followUpYmdIn(14)).getTime() && saved.followUpNote === null, `${r.status}`);
    check("…response has no gateway ids or door code", !("cashfreeOrderId" in r.json) && !("visitOtp" in r.json), "ok");
    r = await call(doctor, "PATCH", `/api/appointments/${a.id}`, { followUp: null });
    check("clear → 200, no follow-up", r.status === 200 && (await row(a.id)).followUpDate === null, `${r.status}`);

    // ── Reminder: once, localized, skipped when rebooked or deleted ──
    // Far enough ahead (10 days) that the dev server's own 5-minute sweep
    // never picks these rows; the sweep here runs with a clock 2 h before
    // the follow-up day (i.e. 10 pm IST the evening before).
    const day = followUpYmdIn(10);
    const at = followUpInstant(day);
    const evening = new Date(at.getTime() - 2 * HOUR);
    await prisma.appointment.update({ where: { id: a.id }, data: { followUpDate: at, followUpReminderSentAt: null } });
    const rebookedVisit = await visit();
    await prisma.appointment.update({ where: { id: rebookedVisit.id }, data: { status: "COMPLETED", completedAt: new Date(), followUpDate: at } });
    await prisma.appointment.create({ data: { patientId: patient.id, doctorId: doctor.id, symptoms: "FOLLOWUP-TEST", status: "PENDING_APPROVAL", followUpOfId: rebookedVisit.id, scheduledAt: new Date(at.getTime() - 2 * DAY) } });
    const inbox = () => prisma.notification.findMany({ where: { userId: patient.id, kind: "followUpReminder" } });

    await sendDueFollowUpReminders(new Date(at.getTime() - 8 * HOUR));
    check("before 6 pm IST the evening before → nothing yet", (await inbox()).length === 0 && (await row(a.id)).followUpReminderSentAt === null, "none");
    await sendDueFollowUpReminders(evening);
    let notes = await inbox();
    check("evening before → one inbox notification", notes.length === 1, `${notes.length}`);
    check("…in the patient's language (Marathi) with the doctor's name", /फॉलो-अप/.test(notes[0]?.title ?? "") && /Dr\. Follow Doctor/.test(notes[0]?.body ?? "") && !(notes[0]?.body ?? "").includes(NOTE), `${notes[0]?.title} | ${notes[0]?.body}`);
    check("…marked sent", !!(await row(a.id)).followUpReminderSentAt, "marked");
    await Promise.all([sendDueFollowUpReminders(evening), sendDueFollowUpReminders(new Date(at.getTime() + 3 * HOUR))]);
    notes = await inbox();
    check("later sweeps → still exactly one", notes.length === 1, `${notes.length}`);
    check("rebooked (a follow-up booking of that visit exists) → skipped but marked", !!(await row(rebookedVisit.id)).followUpReminderSentAt, "marked, no extra notification");

    // Changing the date re-arms it.
    r = await call(doctor, "PATCH", `/api/appointments/${a.id}`, { followUp: { date: followUpYmdIn(12) } });
    check("changing the date clears the sent marker", r.status === 200 && (await row(a.id)).followUpReminderSentAt === null, `${r.status}`);

    // A live booking on/after the day also counts as rebooked; a deleted account gets nothing.
    const day12 = followUpInstant(followUpYmdIn(12));
    await prisma.appointment.create({ data: { patientId: patient.id, doctorId: doctor.id, symptoms: "FOLLOWUP-TEST", status: "SCHEDULED", scheduledAt: new Date(day12.getTime() + 12 * HOUR) } });
    await sendDueFollowUpReminders(new Date(day12.getTime() - 2 * HOUR));
    check("live booking with the doctor on the day → skipped", (await inbox()).length === 1 && !!(await row(a.id)).followUpReminderSentAt, `${(await inbox()).length}`);

    const gone = await visit();
    await prisma.appointment.update({ where: { id: gone.id }, data: { status: "COMPLETED", completedAt: new Date(), followUpDate: followUpInstant(followUpYmdIn(9)) } });
    await prisma.user.update({ where: { id: patient.id }, data: { deletedAt: new Date() } });
    await sendDueFollowUpReminders(new Date(followUpInstant(followUpYmdIn(9)).getTime() - 2 * HOUR));
    check("deleted patient → no notification", (await inbox()).length === 1, `${(await inbox()).length}`);
    await prisma.user.update({ where: { id: patient.id }, data: { deletedAt: null } });

    const page = await fetch(`${BASE}/patient/book?doctorId=${doctor.id}&followUpOf=${a.id}&consultType=CLINIC`, { headers: { Cookie: cookieFor(patient) }, redirect: "manual" });
    check("pre-filled booking page renders", page.status === 200, `${page.status}`);
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { followUpOfId: { not: null }, OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.staffProfile.deleteMany({ where: { OR: [{ userId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
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
