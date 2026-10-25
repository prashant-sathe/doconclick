// Medicine reminders (FP1-22): frequency/duration parsing ("1-0-1", "BD",
// "TDS", "x5 days"…), reminders built on prescription save and rebuilt on a
// re-save, the patient's own-only screen API (times picker, per-medicine and
// master switch, "taken" tick), and the sweeps — one generic push per dose
// time, never twice, never in quiet hours (22:00–06:00), nothing for a
// switched-off / deleted account or a cancelled visit, and the "running out —
// see the doctor again" nudge on a course's last two days with the follow-up
// booking link. Pure checks, then API checks against its own dev server
// (BASE_URL to use a running one) and the DB in .env, throwaway users only.
// The sweeps are run here with chosen clocks on days well in the future, so
// the server's own 5-minute sweep never touches these rows; the users have no
// push tokens and Firebase is unset, so nothing reaches FCM.
//
//   npm run test:medicine-reminders
import "dotenv/config";
import jwt from "jsonwebtoken";
import type { ChildProcess } from "child_process";
import { prisma } from "../src/lib/prisma";
import { parseFrequency, parseDurationDays, isAllowedDoseTime, normalizeDoseTimes } from "../src/lib/medicineSchedule";
import { sendDueMedicineReminders, sendDueRefillReminders } from "../src/lib/medicineReminders";
import { deleteAccount } from "../src/lib/userDeletion";
import { addDaysYmd, istDayKey, istStartOfDay } from "../src/lib/istDate";
import { startDevServer } from "./devServer";

// Never a real push from a test.
for (const k of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) process.env[k] = "";

let BASE = process.env.BASE_URL ?? "";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const HOUR = 3600e3, DAY = 24 * HOUR;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string };
// Users whose requests carry an app-language cookie (server errors come back in it).
const LANG: Record<string, string> = {};
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}${LANG[u.id] ? `; doconclick_lang=${LANG[u.id]}` : ""}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: J = {};
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const times = (s: string) => { const p = parseFrequency(s); return p.kind === "times" ? p.times : p.kind; };

function pureChecks() {
  const freq: [string, unknown][] = [
    ["1-0-1", ["08:00", "21:00"]], ["1-1-1", ["08:00", "14:00", "21:00"]], ["0-0-1", ["21:00"]], ["1 - 0 - 0", ["08:00"]],
    ["1-1-1-1", ["08:00", "13:00", "18:00", "21:00"]], ["½-0-½", ["08:00", "21:00"]], ["1-0-1 after food", ["08:00", "21:00"]],
    ["BD", ["08:00", "21:00"]], ["TDS", ["08:00", "14:00", "21:00"]], ["OD", ["08:00"]], ["QID", ["08:00", "13:00", "18:00", "21:00"]],
    ["HS", ["21:00"]], ["Once daily", ["08:00"]], ["Twice daily", ["08:00", "21:00"]], ["Thrice daily", ["08:00", "14:00", "21:00"]],
    ["Four times daily", ["08:00", "13:00", "18:00", "21:00"]], ["At bedtime", ["21:00"]], ["q8h", ["08:00", "14:00", "21:00"]],
    ["every 12 hours", ["08:00", "21:00"]], ["morning and night", ["08:00", "21:00"]],
    ["SOS", "asNeeded"], ["As needed", "asNeeded"], ["After meals", "unknown"], ["Before meals", "unknown"], ["", "unknown"], ["0-0-0", "unknown"],
  ];
  const bad = freq.filter(([s, want]) => !same(times(s), want));
  check(`parseFrequency: ${freq.length} cases ("1-0-1", BD, TDS, OD, HS, q8h, SOS, After meals…)`, bad.length === 0, bad.length ? bad.map(([s]) => `${s} → ${JSON.stringify(times(s))}`).join("; ") : "all as expected");
  const dur: [string, number | null][] = [
    ["5 days", 5], ["x5 days", 5], ["X 5 days", 5], ["5d", 5], ["3 days", 3], ["10 days", 10], ["2 weeks", 14], ["1 month", 30], ["7", 7], ["for 7", 7],
    ["Other", null], ["", null], ["continue", null], ["200 days", null], ["0 days", null],
  ];
  const badD = dur.filter(([s, want]) => parseDurationDays(s) !== want);
  check(`parseDurationDays: ${dur.length} cases`, badD.length === 0, badD.length ? badD.map(([s]) => `${s} → ${parseDurationDays(s)}`).join("; ") : "all as expected");
  check("quiet hours: 06:00 and 21:59 allowed, 05:59 / 22:00 / 23:30 / 25:00 refused",
    isAllowedDoseTime("06:00") && isAllowedDoseTime("21:59") && !isAllowedDoseTime("05:59") && !isAllowedDoseTime("22:00") && !isAllowedDoseTime("23:30") && !isAllowedDoseTime("25:00"), "ok");
  check("normalizeDoseTimes sorts + dedupes, refuses 7 times / bad input",
    same(normalizeDoseTimes(["21:00", "08:00", "08:00"]), ["08:00", "21:00"]) && normalizeDoseTimes(["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"]) === null && normalizeDoseTimes("08:00") === null, "ok");
}

async function main() {
  pureChecks();

  let child: ChildProcess | null = null;
  if (!BASE) {
    const started = await startDevServer({ label: "medicine-reminders", env: { FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" } });
    child = started.child;
    BASE = started.base;
  }

  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `6${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const profile = { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY) } };

  try {
    const doctor = await mk({ name: "Pill Doctor", role: "DOCTOR", doctorProfile: profile });
    const patient = await mk({ name: "Pill Patient", role: "PATIENT", password: "x", language: "mr-IN", patientProfile: { create: { age: 64, gender: "Female" } } });
    LANG[patient.id] = "mr-IN";
    const stranger = await mk({ name: "Pill Stranger", role: "PATIENT", password: "x", patientProfile: { create: { age: 30, gender: "Male" } } });
    const pp = await prisma.patientProfile.findUniqueOrThrow({ where: { userId: patient.id } });
    const aai = await prisma.patientDependent.create({ data: { patientProfileId: pp.id, name: "Aai", relation: "Mother", age: 82 } });

    const visit = (extra: Record<string, unknown> = {}) =>
      prisma.appointment.create({ data: { patientId: patient.id, doctorId: doctor.id, symptoms: "PILL-TEST", consultType: "CLINIC", status: "SCHEDULED", paymentMethod: "CASH", amount: 300, scheduledAt: new Date(Date.now() - HOUR), ...extra } });
    const rems = (appointmentId: string) => prisma.medicineReminder.findMany({ where: { appointmentId }, orderBy: { name: "asc" } });
    const today = istDayKey(new Date());
    const ymd = (d: Date | null | undefined) => (d ? istDayKey(d) : null);

    // ── Built on complete ──
    const a = await visit();
    let r = await call(doctor, "POST", `/api/appointments/${a.id}/complete`, {
      medicines: [
        { name: "Amoxicillin 500", dosage: "1 tab", frequency: "1-0-1", duration: "x5 days" },
        { name: "Paracetamol 650", frequency: "SOS", duration: "3 days" },
        { name: "Vitamin D3", frequency: "After meals", duration: "Other" },
      ],
    });
    let list = await rems(a.id);
    check("complete → 200, one reminder per medicine except SOS", r.status === 200 && list.length === 2 && !list.some((x) => /Paracetamol/.test(x.name)), `${r.status} ${list.map((x) => x.name).join(", ")}`);
    const amox = list.find((x) => x.name.startsWith("Amox"))!;
    const vit = list.find((x) => x.name.startsWith("Vitamin"))!;
    check("…1-0-1 x5 days → 08:00 + 21:00, today to today+4 (IST)", same(amox?.timesOfDay, ["08:00", "21:00"]) && ymd(amox.startDate) === today && ymd(amox.endDate) === addDaysYmd(today, 4), `${amox?.timesOfDay} ${ymd(amox?.startDate)}→${ymd(amox?.endDate)}`);
    check("…unreadable frequency/duration → no times, no end (patient picks)", vit && vit.timesOfDay.length === 0 && vit.endDate === null, `${vit?.timesOfDay} ${vit?.endDate}`);
    check("…owned by the account holder", list.every((x) => x.patientId === patient.id), "ok");

    // Family member's prescription → same account holder, labelled for them.
    const fam = await visit({ dependentId: aai.id, relation: "Mother", patientName: "Aai" });
    r = await call(doctor, "POST", `/api/appointments/${fam.id}/complete`, { medicines: [{ name: "Amlodipine 5", frequency: "1-0-0", duration: "1 month" }] });
    const famRem = (await rems(fam.id))[0];
    check("family member's prescription → reminder on the account holder, 30 days", r.status === 200 && famRem?.patientId === patient.id && ymd(famRem.endDate) === addDaysYmd(today, 29), `${r.status} ${ymd(famRem?.endDate)}`);

    // ── Patient screen API: own rows only ──
    r = await call(patient, "GET", "/api/patients/me/medicine-reminders");
    const view = r.json as unknown as { enabled: boolean; reminders: { id: string; needsSetup: boolean; person: { name: string } | null; doctorName: string }[] };
    check("patient GET → their 3 medicines, master on", r.status === 200 && view.enabled === true && view.reminders?.length === 3, `${r.status} ${view.reminders?.length}`);
    check("…family member's labelled 'Aai', Vitamin D needs setup", view.reminders.some((x) => x.person?.name === "Aai") && view.reminders.find((x) => x.id === vit.id)?.needsSetup === true, "ok");
    r = await call(stranger, "GET", "/api/patients/me/medicine-reminders");
    check("another patient sees none of them", r.status === 200 && (r.json.reminders as unknown[]).length === 0 && !r.text.includes("Amoxicillin"), `${r.status}`);
    r = await call(doctor, "GET", "/api/patients/me/medicine-reminders");
    check("a doctor → 403", r.status === 403, `${r.status}`);
    r = await call(stranger, "PATCH", `/api/patients/me/medicine-reminders/${amox.id}`, { enabled: false });
    check("another patient PATCH → 404, unchanged", r.status === 404 && (await prisma.medicineReminder.findUniqueOrThrow({ where: { id: amox.id } })).enabled, `${r.status}`);
    r = await call(stranger, "POST", `/api/patients/me/medicine-reminders/${amox.id}/doses`, { time: "08:00", taken: true });
    check("another patient tick → 404", r.status === 404, `${r.status}`);

    r = await call(patient, "PATCH", `/api/patients/me/medicine-reminders/${vit.id}`, { timesOfDay: ["23:00"] });
    check("dose time in quiet hours → 400 (Marathi message)", r.status === 400 && /वेळा/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    r = await call(patient, "PATCH", `/api/patients/me/medicine-reminders/${vit.id}`, { days: 400 });
    check("400 days → 400", r.status === 400, `${r.status}`);
    r = await call(patient, "PATCH", `/api/patients/me/medicine-reminders/${vit.id}`, { timesOfDay: ["09:30"], days: 10 });
    let vitRow = await prisma.medicineReminder.findUniqueOrThrow({ where: { id: vit.id } });
    check("pick 09:30 for 10 days → saved, marked as the patient's choice", r.status === 200 && same(vitRow.timesOfDay, ["09:30"]) && ymd(vitRow.endDate) === addDaysYmd(today, 9) && vitRow.setByPatient, `${r.status} ${vitRow.timesOfDay}`);

    // Tick / untick today's dose.
    r = await call(patient, "POST", `/api/patients/me/medicine-reminders/${amox.id}/doses`, { time: "10:00", taken: true });
    check("tick a time that isn't one of its doses → 400", r.status === 400, `${r.status}`);
    r = await call(patient, "POST", `/api/patients/me/medicine-reminders/${amox.id}/doses`, { time: "21:00", taken: true });
    const doses = await prisma.medicineDose.findMany({ where: { reminderId: amox.id } });
    check("tick today's 21:00 → stored as taken", r.status === 200 && doses.length === 1 && !!doses[0].takenAt && doses[0].doseDate === today, `${r.status} ${doses.length}`);
    r = await call(patient, "GET", "/api/patients/me/medicine-reminders");
    check("…GET shows it ticked", ((r.json.reminders as { id: string; takenToday: string[] }[]).find((x) => x.id === amox.id)?.takenToday ?? []).includes("21:00"), "ok");
    r = await call(patient, "POST", `/api/patients/me/medicine-reminders/${amox.id}/doses`, { time: "21:00", taken: false });
    check("untick → row removed (dose can still be reminded)", r.status === 200 && (await prisma.medicineDose.count({ where: { reminderId: amox.id } })) === 0, `${r.status}`);

    // ── Rebuilt on a re-save (prescription version change) ──
    r = await call(doctor, "POST", `/api/appointments/${a.id}/prescription-items`, {
      medicines: [
        { name: "Amoxicillin 500", dosage: "1 tab", frequency: "1-0-1", duration: "7 days" },
        { name: "Vitamin D3", frequency: "After meals", duration: "Other" },
        { name: "Cetirizine 10", frequency: "HS", duration: "3 days" },
      ],
    });
    list = await rems(a.id);
    const amox2 = list.find((x) => x.name.startsWith("Amox"));
    vitRow = list.find((x) => x.name.startsWith("Vitamin"))!;
    const cet = list.find((x) => x.name.startsWith("Cetirizine"));
    check("re-save → 200, Amoxicillin kept (same row) and now ends today+6", r.status === 200 && amox2?.id === amox.id && ymd(amox2.endDate) === addDaysYmd(today, 6), `${r.status} ${ymd(amox2?.endDate)}`);
    check("…Vitamin D unchanged by the doctor → patient's 09:30 / 10 days kept", same(vitRow?.timesOfDay, ["09:30"]) && ymd(vitRow.endDate) === addDaysYmd(today, 9), `${vitRow?.timesOfDay}`);
    check("…new Cetirizine HS → 21:00", same(cet?.timesOfDay, ["21:00"]), `${cet?.timesOfDay}`);
    check("…a new prescription version was recorded", (await prisma.prescriptionVersion.count({ where: { appointmentId: a.id } })) >= 2, "ok");
    r = await call(doctor, "POST", `/api/appointments/${a.id}/prescription-items`, {
      medicines: [{ name: "Amoxicillin 500", dosage: "1 tab", frequency: "1-0-1", duration: "7 days" }, { name: "Vitamin D3", frequency: "After meals", duration: "Other" }],
    });
    check("removing a medicine removes its reminder", r.status === 200 && (await rems(a.id)).length === 2, `${(await rems(a.id)).length}`);

    // ── Dose sweep: on a day 10 days ahead (the server's own sweep never sees it) ──
    const D = addDaysYmd(today, 10);
    const at = (ymdStr: string, hhmm: string) => new Date(`${ymdStr}T${hhmm}:00+05:30`);
    await prisma.medicineReminder.updateMany({ where: { patientId: patient.id }, data: { startDate: istStartOfDay(D), endDate: istStartOfDay(addDaysYmd(D, 4)) } });
    const inbox = (kind: string) => prisma.notification.findMany({ where: { userId: patient.id, kind }, orderBy: { createdAt: "asc" } });

    let sent = await sendDueMedicineReminders(at(D, "07:55"));
    check("before the dose time → nothing", sent === 0 && (await inbox("medicineDose")).length === 0, `${sent}`);
    sent = await sendDueMedicineReminders(at(D, "08:05"));
    let notes = await inbox("medicineDose");
    check("08:05 → one push for the 08:00 doses (own + family member's grouped)", sent === 1 && notes.length === 1 && /2/.test(notes[0].body), `${sent} ${notes[0]?.body}`);
    check("…in Marathi, generic: no medicine name or person on the lock screen", /औषध/.test(notes[0]?.title ?? "") && !/Amox|Amlod|Aai/i.test(`${notes[0]?.title} ${notes[0]?.body}`) && notes[0]?.url === "/patient/profile/medicines", `${notes[0]?.title} | ${notes[0]?.body}`);
    await Promise.all([sendDueMedicineReminders(at(D, "08:10")), sendDueMedicineReminders(at(D, "08:10")), sendDueMedicineReminders(at(D, "08:20"))]);
    check("later / parallel sweeps → still exactly one (each dose once)", (await inbox("medicineDose")).length === 1 && (await prisma.medicineDose.count({ where: { reminder: { patientId: patient.id }, doseDate: D, doseTime: "08:00" } })) === 2, `${(await inbox("medicineDose")).length}`);
    sent = await sendDueMedicineReminders(at(D, "08:45"));
    check("a dose more than 30 min old isn't sent late", sent === 0, `${sent}`);
    sent = await sendDueMedicineReminders(at(D, "09:31"));
    check("09:30 (the patient's own time) → one more push", sent === 1 && (await inbox("medicineDose")).length === 2, `${sent}`);

    // Taken before the time → no push for it.
    await prisma.medicineDose.create({ data: { reminderId: amox.id, doseDate: D, doseTime: "21:00", takenAt: new Date() } });
    sent = await sendDueMedicineReminders(at(D, "21:02"));
    check("dose already ticked as taken → no push", sent === 0, `${sent}`);

    // Quiet hours: nothing between 22:00 and 06:00, whatever is stored.
    await prisma.medicineReminder.update({ where: { id: vit.id }, data: { timesOfDay: ["05:45", "22:05"] } });
    const q1 = await sendDueMedicineReminders(at(D, "05:50"));
    const q2 = await sendDueMedicineReminders(at(D, "22:10"));
    check("quiet hours (05:50, 22:10) → nothing", q1 + q2 === 0, `${q1}+${q2}`);
    await prisma.medicineReminder.update({ where: { id: vit.id }, data: { timesOfDay: ["09:30"] } });

    // Off switches and a gone account.
    const D1 = addDaysYmd(D, 1);
    await prisma.medicineReminder.update({ where: { id: amox.id }, data: { enabled: false } });
    await sendDueMedicineReminders(at(D1, "08:02"));
    notes = await inbox("medicineDose");
    check("medicine switched off → only the other 08:00 dose counted", notes.length === 3 && /1/.test(notes[2].body) && (await prisma.medicineDose.count({ where: { reminderId: amox.id, doseDate: D1 } })) === 0, `${notes.length} ${notes[2]?.body}`);
    await prisma.medicineReminder.update({ where: { id: amox.id }, data: { enabled: true } });
    r = await call(patient, "PATCH", "/api/patients/me/medicine-reminders", { enabled: false });
    sent = await sendDueMedicineReminders(at(D1, "09:31"));
    check("master switch off (via API) → nothing", r.status === 200 && sent === 0, `${r.status} ${sent}`);
    await call(patient, "PATCH", "/api/patients/me/medicine-reminders", { enabled: true });
    await prisma.appointment.update({ where: { id: fam.id }, data: { status: "CANCELLED" } });
    const D2 = addDaysYmd(D, 2);
    await prisma.medicineReminder.update({ where: { id: amox.id }, data: { enabled: false } });
    sent = await sendDueMedicineReminders(at(D2, "08:03"));
    check("cancelled visit's prescription → nothing", sent === 0, `${sent}`);
    await prisma.medicineReminder.update({ where: { id: amox.id }, data: { enabled: true } });
    await prisma.user.update({ where: { id: patient.id }, data: { deletedAt: new Date() } });
    sent = await sendDueMedicineReminders(at(D2, "21:01"));
    check("deleted account → nothing", sent === 0, `${sent}`);
    await prisma.user.update({ where: { id: patient.id }, data: { deletedAt: null } });

    // ── Refill nudge: last 2 days of a 3+ day course, once ──
    const E = addDaysYmd(today, 20);
    await prisma.medicineReminder.updateMany({ where: { appointmentId: a.id }, data: { startDate: istStartOfDay(addDaysYmd(E, -4)), endDate: istStartOfDay(addDaysYmd(E, 1)) } });
    let refills = await sendDueRefillReminders(at(addDaysYmd(E, -1), "10:00"));
    check("3 days before the end → no refill nudge yet", refills === 0, `${refills}`);
    refills = await sendDueRefillReminders(at(E, "08:00"));
    check("before 9 am → none", refills === 0, `${refills}`);
    refills = await sendDueRefillReminders(at(E, "10:00"));
    notes = await inbox("medicineRefill");
    check("second-last day, 10:00 → one nudge", refills === 1 && notes.length === 1, `${refills} ${notes.length}`);
    check("…Marathi 'औषध संपत आलं', links to the follow-up booking of this visit", /औषध संपत आलं/.test(notes[0]?.title ?? "") && notes[0]?.url.includes(`followUpOf=${a.id}`) && notes[0]?.url.startsWith("/patient/book?") && !/Amox/.test(notes[0]?.body ?? ""), `${notes[0]?.title} | ${notes[0]?.url}`);
    await Promise.all([sendDueRefillReminders(at(E, "10:05")), sendDueRefillReminders(at(addDaysYmd(E, 1), "11:00"))]);
    check("…never again", (await inbox("medicineRefill")).length === 1, `${(await inbox("medicineRefill")).length}`);

    // Skipped when the doctor set a follow-up date, or the patient already rebooked.
    const b = await visit();
    await call(doctor, "POST", `/api/appointments/${b.id}/complete`, { medicines: [{ name: "Metformin 500", frequency: "BD", duration: "10 days" }] });
    const c = await visit();
    await call(doctor, "POST", `/api/appointments/${c.id}/complete`, { medicines: [{ name: "Pantoprazole 40", frequency: "OD", duration: "10 days" }] });
    await prisma.appointment.update({ where: { id: b.id }, data: { followUpDate: istStartOfDay(addDaysYmd(E, 3)) } });
    await prisma.appointment.create({ data: { patientId: patient.id, doctorId: doctor.id, symptoms: "PILL-TEST", status: "PENDING_APPROVAL", followUpOfId: c.id, scheduledAt: istStartOfDay(addDaysYmd(E, 2)) } });
    const F = addDaysYmd(today, 40);
    await prisma.medicineReminder.updateMany({ where: { appointmentId: { in: [b.id, c.id] } }, data: { startDate: istStartOfDay(addDaysYmd(F, -9)), endDate: istStartOfDay(F) } });
    refills = await sendDueRefillReminders(at(F, "12:00"));
    check("doctor set a follow-up / patient already rebooked → no nudge", refills === 0 && (await inbox("medicineRefill")).length === 1, `${refills}`);

    // The screen's "see the doctor again" card: a course ending tomorrow.
    await prisma.medicineReminder.updateMany({ where: { appointmentId: a.id }, data: { startDate: istStartOfDay(addDaysYmd(today, -5)), endDate: istStartOfDay(addDaysYmd(today, 1)) } });
    r = await call(patient, "GET", "/api/patients/me/medicine-reminders");
    const cards = r.json.refills as { appointmentId: string; href: string }[];
    check("screen shows the rebook card for the course ending tomorrow (not for the rebooked one)", cards?.some((x) => x.appointmentId === a.id && x.href.includes(`followUpOf=${a.id}`)) && !cards.some((x) => x.appointmentId === c.id), JSON.stringify(cards?.map((x) => x.appointmentId)));
    const page = await fetch(`${BASE}/patient/profile/medicines`, { headers: { Cookie: cookieFor(patient) }, redirect: "manual" });
    check("/patient/profile/medicines renders for the patient", page.status === 200, `${page.status}`);

    // Account deletion removes the reminders and dose ticks.
    await deleteAccount(patient.id, "PATIENT");
    check("account deletion → reminders and doses gone", (await prisma.medicineReminder.count({ where: { patientId: patient.id } })) === 0 && (await prisma.medicineDose.count({ where: { reminderId: amox.id } })) === 0, "0 rows");
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.medicineReminder.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { followUpOfId: { not: null }, OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    child?.kill("SIGTERM");
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
