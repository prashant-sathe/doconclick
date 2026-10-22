// Provider-wide time off and "Go offline now" (src/lib/timeOff.ts): a doctor
// or nurse blocks a range of days (every clinic/video/home visit) or the rest
// of today. Live bookings in that time are listed first, then — once the
// exact list is confirmed — cancelled, refunded to the patient's wallet and
// notified; visits already under way and past timed ones are kept, and
// pending reschedule requests into the period are declined. Nothing new can
// be booked, rescheduled or matched onto those days. Against a live dev
// server and the DB in .env, throwaway users only.
//
//   npm run test:time-off        (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { istDayKey, addDaysYmd } from "../src/lib/istDate";
import { doctorSlotProblem } from "../src/lib/doctorSlots";
import { nurseSlotProblem } from "../src/lib/nurseSchedule";
import { findReassignmentCandidates } from "../src/lib/doctorMatching";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(as ? { Cookie: cookieFor(as) } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}
const at = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+05:30`);

async function main() {
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mob = () => `6${stamp}${String(n++).padStart(2, "0")}`;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: mob(), termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const spec = `TimeOffSpec${stamp}`;
  const doctorProfile = (extra: Record<string, unknown> = {}) => ({
    create: {
      status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY),
      specialty: spec, consultFee: 500, videoFee: 300, offersClinic: true, offersVideo: true, offersHomeVisit: true,
      availability: "Mon-Sun, 12AM-11:59PM", lat: 18.52, lng: 73.85, ...extra,
    },
  });
  const allWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ dayOfWeek: d, fromTime: "00:10", toTime: "23:50" }));
  const doctor = await mk({ name: "Leave Doctor", role: "DOCTOR", doctorProfile: doctorProfile() });
  const backup = await mk({ name: "Backup Doctor", role: "DOCTOR", doctorProfile: doctorProfile() });
  const clinic = await prisma.clinic.create({ data: { doctorId: doctor.id, name: "Leave Clinic", address: "Pune", lat: 18.52, lng: 73.85, slots: { create: allWeek } } });
  await prisma.clinic.create({ data: { doctorId: backup.id, name: "Backup Clinic", address: "Pune", lat: 18.52, lng: 73.85, slots: { create: allWeek } } });
  const desk = await mk({ name: "Leave Desk", role: "STAFF" });
  await prisma.staffProfile.create({ data: { userId: desk.id, doctorId: doctor.id } });
  const suspended = await mk({ name: "Suspended Doctor", role: "DOCTOR", doctorProfile: doctorProfile({ status: "SUSPENDED" }) });
  const nurse = await mk({ name: "Leave Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED", isVerified: true, availability: "Mon-Sun, 12AM-11:59PM", lat: 18.52, lng: 73.85 } } });
  const pp = { create: { age: 30, gender: "Male", homeAddress: "12 MG Road, Pune", lat: 18.52, lng: 73.85 } };
  const patient = await mk({ name: "Leave Patient", role: "PATIENT", password: "x", patientProfile: pp });
  const patient2 = await mk({ name: "Leave Patient Two", role: "PATIENT", password: "x", patientProfile: pp });

  const today = istDayKey(new Date());
  const d1 = addDaysYmd(today, 1), d2 = addDaysYmd(today, 2), d3 = addDaysYmd(today, 3), d5 = addDaysYmd(today, 5);
  // A live booking; timed when scheduledAt is later than createdAt (src/lib/doctorSlots.ts).
  const booking = (doctorId: string, scheduledAt: Date, extra: Record<string, unknown> = {}) =>
    prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId, symptoms: "TIME-OFF-TEST", consultType: "CLINIC", clinicId: doctorId === doctor.id ? clinic.id : null,
        status: "SCHEDULED", paymentMethod: "ONLINE", amount: 500, scheduledAt, createdAt: new Date(Date.now() - 60_000), ...extra,
      },
    });
  const appt = (id: string) => prisma.appointment.findUniqueOrThrow({ where: { id } });
  const balance = async (userId: string) => (await prisma.wallet.findUnique({ where: { userId } }))?.balance ?? 0;
  const bookClinic = (as: U, scheduledAt?: Date) =>
    call(as, "POST", "/api/appointments", { doctorId: doctor.id, clinicId: clinic.id, consultType: "CLINIC", symptoms: "Fever and cough", consentGiven: true, ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}) });

  try {
    // ── Who ──
    let r = await call(patient, "GET", "/api/provider/time-off");
    check("patient can't manage time off → 403", r.status === 403, `${r.status}`);
    r = await call(desk, "POST", "/api/provider/time-off", { startDate: d1 });
    check("staff can't either → 403", r.status === 403, `${r.status}`);
    r = await call(suspended, "POST", "/api/provider/time-off", { startDate: d1 });
    check("suspended doctor → 403", r.status === 403, `${r.status}`);

    // ── Validation ──
    for (const [label, body] of [
      ["start in the past", { startDate: addDaysYmd(today, -1) }],
      ["end before start", { startDate: d2, endDate: d1 }],
      ["not a date", { startDate: "2026-02-31" }],
      ["longer than 90 days", { startDate: d1, endDate: addDaysYmd(d1, 90) }],
      ["reason too long", { startDate: d1, reason: "x".repeat(201) }],
    ] as const) {
      r = await call(doctor, "POST", "/api/provider/time-off", body);
      check(`${label} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }

    // ── Time off over existing bookings ──
    const paid = await booking(doctor.id, at(d1, "10:00"), { paymentStatus: "PAID", paidAt: new Date() });
    const pending = await booking(doctor.id, at(d2, "11:00"), { status: "PENDING_APPROVAL" });
    const onTheWay = await booking(doctor.id, at(d1, "12:00"), { consultType: "HOME", clinicId: null, travelStatus: "ON_THE_WAY" });
    const after = await booking(doctor.id, at(d3, "10:00"));
    const movingIn = await booking(doctor.id, at(d5, "10:00"), { requestedScheduledAt: at(d1, "15:00") });
    const other = await booking(backup.id, at(d1, "10:00"));

    r = await call(doctor, "POST", "/api/provider/time-off", { startDate: d1, endDate: d2, reason: "Family function" });
    const listed = ((r.json.bookings ?? []) as { id: string; refund: number; paid: boolean }[]);
    check("bookings in the range → 409 AWAY_HAS_BOOKINGS with the list", r.status === 409 && r.json.code === "AWAY_HAS_BOOKINGS", `${r.status} ${r.json.code}`);
    check("…lists the paid + pending ones, with the refund", listed.length === 2 && listed.some((b) => b.id === paid.id && b.paid && b.refund === 500) && listed.some((b) => b.id === pending.id && !b.paid), JSON.stringify(listed.map((b) => b.id === paid.id ? "paid" : b.id === pending.id ? "pending" : b.id)));
    check("…keeps the visit already under way, and nothing outside the range", r.json.kept === 1 && !listed.some((b) => [onTheWay.id, after.id, movingIn.id].includes(b.id)), `kept ${r.json.kept}`);
    check("…nothing written yet", (await prisma.providerTimeOff.count({ where: { providerId: doctor.id } })) === 0 && (await appt(paid.id)).status === "SCHEDULED", "no row");
    r = await call(doctor, "POST", "/api/provider/time-off", { startDate: d1, endDate: d2, confirmBookingIds: [paid.id] });
    check("confirming only part of the list → asked again", r.status === 409 && r.json.code === "AWAY_HAS_BOOKINGS", `${r.status}`);

    const before = await balance(patient.id);
    r = await call(doctor, "POST", "/api/provider/time-off", { startDate: d1, endDate: d2, reason: "Family function", confirmBookingIds: [paid.id, pending.id] });
    check("confirmed → 200, 2 cancelled, ₹500 refunded", r.status === 200 && r.json.cancelledBookings === 2 && r.json.refundTotal === 500 && r.json.keptInProgress === 1, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
    check("…paid booking CANCELLED and refunded to the wallet", (await appt(paid.id)).status === "CANCELLED" && (await balance(patient.id)) - before === 500, `+₹${(await balance(patient.id)) - before}`);
    check("…pending request CANCELLED", (await appt(pending.id)).status === "CANCELLED", (await appt(pending.id)).status);
    check("…under-way visit and later booking untouched", (await appt(onTheWay.id)).status === "SCHEDULED" && (await appt(after.id)).status === "SCHEDULED", "SCHEDULED");
    const mv = await appt(movingIn.id);
    check("…request to move into the leave declined, visit keeps its time", mv.status === "SCHEDULED" && mv.requestedScheduledAt === null && mv.scheduledAt.getTime() === at(d5, "10:00").getTime(), `req=${mv.requestedScheduledAt}`);
    check("…another doctor's booking untouched", (await appt(other.id)).status === "SCHEDULED", "SCHEDULED");
    const leaveId = String(r.json.id);

    r = await call(doctor, "POST", "/api/provider/time-off", { startDate: d2, endDate: d3 });
    check("overlapping time off → 409", r.status === 409 && /overlaps/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    r = await call(doctor, "GET", "/api/provider/time-off");
    check("GET lists it with the reason", r.status === 200 && (r.json.timeOff as { id: string; reason: string }[]).some((t) => t.id === leaveId && t.reason === "Family function"), `${r.status}`);

    // ── Nothing lands on those days ──
    r = await bookClinic(patient2, at(d1, "16:00"));
    check("patient booking a time during the leave → 409 on leave", r.status === 409 && /on leave/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    r = await call(patient2, "GET", `/api/doctors/${doctor.id}/slots?clinicId=${clinic.id}&date=${d1}`);
    check("slots for a leave day → none, away", r.status === 200 && (r.json.slots as unknown[]).length === 0 && r.json.away === true, `${r.status} ${(r.json.slots as unknown[])?.length}`);
    r = await call(patient2, "GET", `/api/doctors/${doctor.id}/slots?clinicId=${clinic.id}&date=${d3}`);
    check("…the day after → slots again", (r.json.slots as unknown[]).length > 0, `${(r.json.slots as unknown[])?.length}`);
    r = await call(desk, "POST", "/api/doctor/walk-in-appointments", { mobile: patient2.mobile, consultType: "CLINIC", clinicId: clinic.id, scheduledAt: at(d2, "10:00").toISOString(), symptoms: "Walk-in", paymentMethod: "CASH", consentGiven: true, force: true });
    check("front desk booking into the leave → 409 PROVIDER_AWAY (staff wording)", r.status === 409 && r.json.code === "PROVIDER_AWAY" && /The doctor is on leave/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    const prob = await doctorSlotProblem({ doctorId: doctor.id, when: at(d1, "18:00"), against: "confirmed", viewer: "doctor" });
    check("accept/reschedule into the leave (slot check) refuses, doctor wording", !!prob && /You're on time off/.test(prob), String(prob));
    const cands = await findReassignmentCandidates({ excludeDoctorId: "-", specialty: spec, consultType: "VIDEO", patientId: patient.id, when: at(d1, "10:00") });
    check("reassignment/matching skips the doctor on leave", !cands.some((c) => c.id === doctor.id) && cands.some((c) => c.id === backup.id), JSON.stringify(cands.map((c) => c.name)));
    r = await call(null, "GET", `/api/doctors/${doctor.id}`);
    check("public profile shows the leave days (no reason), not away today", r.json.awayNow === false && (r.json.timeOff as { startDate: string; endDate: string }[]).some((t) => t.startDate === d1 && t.endDate === d2) && !JSON.stringify(r.json).includes("Family function"), JSON.stringify(r.json.timeOff));

    // ── Removing it ──
    r = await call(backup, "DELETE", `/api/provider/time-off/${leaveId}`);
    check("someone else's time off → 404", r.status === 404, `${r.status}`);
    r = await call(doctor, "DELETE", `/api/provider/time-off/${leaveId}`);
    r = await call(patient2, "GET", `/api/doctors/${doctor.id}/slots?clinicId=${clinic.id}&date=${d1}`);
    check("removed → those days bookable again", (r.json.slots as unknown[]).length > 0, `${(r.json.slots as unknown[])?.length}`);

    // ── Go offline now ──
    const nowQueue = await prisma.appointment.create({ data: { patientId: patient2.id, doctorId: doctor.id, symptoms: "TIME-OFF-TEST", consultType: "VIDEO", status: "SCHEDULED", paymentMethod: "ONLINE", paymentStatus: "PAID", paidAt: new Date(), amount: 300 } });
    const pastToday = await booking(doctor.id, new Date(Date.now() - 2 * 3600_000), { createdAt: new Date(Date.now() - 5 * 3600_000) });
    const tomorrow = await booking(doctor.id, at(d1, "09:00"));
    r = await call(doctor, "POST", "/api/provider/offline", { offline: true });
    const offList = ((r.json.bookings ?? []) as { id: string }[]).map((b) => b.id);
    check("go offline with today's queue → 409 listing it", r.status === 409 && offList.includes(nowQueue.id), `${r.status} ${offList.length}`);
    check("…not a timed visit already past, not tomorrow", !offList.includes(pastToday.id) && !offList.includes(tomorrow.id), JSON.stringify(offList.length));
    const before2 = await balance(patient2.id);
    r = await call(doctor, "POST", "/api/provider/offline", { offline: true, confirmBookingIds: offList });
    const until = r.json.offlineUntil ? new Date(String(r.json.offlineUntil)) : null;
    check("confirmed → offline until the end of today", r.status === 200 && !!until && istDayKey(until) === today && until.getTime() > Date.now(), `${r.status} ${r.json.offlineUntil}`);
    check("…queue booking cancelled + ₹300 refunded", (await appt(nowQueue.id)).status === "CANCELLED" && (await balance(patient2.id)) - before2 === 300, `+₹${(await balance(patient2.id)) - before2}`);
    check("…past and tomorrow's bookings untouched", (await appt(pastToday.id)).status === "SCHEDULED" && (await appt(tomorrow.id)).status === "SCHEDULED", "SCHEDULED");
    r = await bookClinic(patient2);
    check("patient \"book now\" while offline → 409 PROVIDER_AWAY", r.status === 409 && r.json.code === "PROVIDER_AWAY", `${r.status} ${r.json.error}`);
    r = await bookClinic(patient2, at(d3, "12:00"));
    check("…a later day still books → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(null, "GET", `/api/doctors/${doctor.id}`);
    check("public profile: away now, until today", r.json.awayNow === true && r.json.awayUntil === "today", `${r.json.awayNow} ${r.json.awayUntil}`);
    r = await call(null, "GET", "/api/doctors");
    const listedDoc = ((r.json as unknown as { id: string; awayNow: boolean }[]) ?? []).find((d) => d.id === doctor.id);
    check("doctor list marks them away", listedDoc?.awayNow === true, String(listedDoc?.awayNow));
    r = await call(desk, "POST", "/api/doctor/walk-in-appointments", { mobile: patient2.mobile, consultType: "CLINIC", clinicId: clinic.id, symptoms: "Walk-in", paymentMethod: "CASH", consentGiven: true, force: true });
    check("front desk walk-in while offline → 409", r.status === 409 && /offline/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    r = await call(doctor, "POST", "/api/provider/offline", { offline: false });
    check("go online → bookable now again", r.status === 200 && (await bookClinic(patient2)).status === 200, `${r.status}`);

    // ── Nurse ──
    const visit = await prisma.appointment.create({ data: { patientId: patient.id, doctorId: nurse.id, providerType: "NURSE", symptoms: "TIME-OFF-TEST", consultType: "HOME", status: "SCHEDULED", paymentMethod: "ONLINE", amount: 400, scheduledAt: at(d1, "10:00"), createdAt: new Date(Date.now() - 60_000), serviceName: "Injection" } });
    const started = await prisma.appointment.create({ data: { patientId: patient.id, doctorId: nurse.id, providerType: "NURSE", symptoms: "TIME-OFF-TEST", consultType: "HOME", status: "SCHEDULED", paymentMethod: "ONLINE", amount: 400, scheduledAt: at(d1, "13:00"), createdAt: new Date(Date.now() - 60_000), visitStartedAt: new Date() } });
    r = await call(nurse, "POST", "/api/provider/time-off", { startDate: d1 });
    check("nurse time off → 409 listing the visit, keeping the started one", r.status === 409 && (r.json.bookings as { id: string }[]).length === 1 && r.json.kept === 1, `${r.status} ${r.json.kept}`);
    r = await call(nurse, "POST", "/api/provider/time-off", { startDate: d1, confirmBookingIds: [visit.id] });
    check("…confirmed → cancelled", r.status === 200 && (await appt(visit.id)).status === "CANCELLED" && (await appt(started.id)).status === "SCHEDULED", `${r.status}`);
    const np = await nurseSlotProblem({ nurseId: nurse.id, availability: "Mon-Sun, 12AM-11:59PM", when: at(d1, "17:00"), durationMinutes: 30, viewer: "patient" });
    check("nurse slot check refuses the leave day, nurse wording", !!np && /This nurse is on leave/.test(np), String(np));
  } finally {
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.staffProfile.deleteMany({ where: { OR: [{ userId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.clinic.deleteMany({ where: { doctorId: { in: ids } } });
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
