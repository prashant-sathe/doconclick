// Bulk-accept time checks + reassignment candidate checks (BUG-TRACKER #39).
// Bulk-accept (and single accept) won't confirm a timed request whose slot
// has passed or whose clinic is inactive / on leave that day. Doctor-cancel
// auto-reassignment only picks a replacement who works at the booking's time
// (clinic hours + leave, or their hours for video/home) and is free then —
// trying the next-nearest instead of giving up. Against a live dev server and
// the DB in .env, throwaway users only (a unique specialty keeps real doctors
// out of the candidate pool).
//
//   npm run test:reassign-accept
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

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
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string } };
}

// IST helpers: the first weekday date at least `minDays` ahead, and an instant on it.
const istDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const istWeekday = (date: string) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" });
function weekdayAhead(minDays: number, not: string[] = []): string {
  for (let i = minDays; i < minDays + 10; i++) {
    const date = istDate(new Date(Date.now() + i * DAY));
    if (!["Sat", "Sun"].includes(istWeekday(date)) && !not.includes(date)) return date;
  }
  throw new Error("unreachable");
}
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);
const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const specialty = `Reassign Test ${stamp}`;
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `3${stamp}${String(n++).padStart(2, "0")}`.slice(0, 12), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const doctor = (name: string, profile: Record<string, unknown>) => mk({
    name, role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY), specialty, ...profile } },
  });
  const clinicFor = (doctorId: string, name: string, lat: number, days = ALL_DAYS, leaves: string[] = []) => prisma.clinic.create({
    data: {
      doctorId, name, address: "1 Test Rd", lat, lng: 73.8,
      slots: { create: days.map((d) => ({ dayOfWeek: d, fromTime: "09:00", toTime: "17:00" })) },
      leaves: { create: leaves.map((date) => ({ date })) },
    },
  });
  const patient = await mk({ name: "Reassign Patient", role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 30, gender: "Male", lat: 18.5, lng: 73.8 } } });
  const appt = (doctorId: string, extra: Record<string, unknown>) => prisma.appointment.create({
    data: { doctorId, patientId: patient.id, symptoms: "fever", amount: 500, paymentMethod: "CASH", consultType: "VIDEO", ...extra } as never,
  });

  const day = weekdayAhead(3);
  try {
    // ── Bulk-accept / accept time checks ──
    // Own specialty, so it's never a reassignment candidate below.
    const acceptor = await doctor("Accepting Doctor", { offersVideo: true, specialty: `${specialty} accept` });
    const open = await clinicFor(acceptor.id, "Open Clinic", 18.5, ALL_DAYS, [day]);
    const closed = await clinicFor(acceptor.id, "Closed Clinic", 18.5);
    await prisma.clinic.update({ where: { id: closed.id }, data: { isActive: false } });
    // A different day from `day` — over a weekend both searches land on the same Monday.
    const otherDay = weekdayAhead(5, [day]);
    const onLeave = await appt(acceptor.id, { status: "PENDING_APPROVAL", consultType: "CLINIC", clinicId: open.id, scheduledAt: at(day, "10:00") });
    const passed = await appt(acceptor.id, { status: "PENDING_APPROVAL", createdAt: new Date(Date.now() - 25 * MIN), scheduledAt: new Date(Date.now() - 20 * MIN) });
    const atClosed = await appt(acceptor.id, { status: "PENDING_APPROVAL", consultType: "CLINIC", clinicId: closed.id, scheduledAt: at(otherDay, "11:00") });
    const fine = await appt(acceptor.id, { status: "PENDING_APPROVAL", consultType: "CLINIC", clinicId: open.id, scheduledAt: at(otherDay, "10:00") });

    let r = await call(acceptor, "PATCH", `/api/appointments/${onLeave.id}`, { status: "SCHEDULED" });
    check("single accept on a leave day → 409", r.status === 409 && (r.json.error ?? "").includes("leave"), `${r.status} ${r.json.error}`);
    r = await call(acceptor, "POST", "/api/appointments/bulk-accept");
    const skipped = (r.json.skipped as { id: string; reason: string }[] | undefined) ?? [];
    const reason = (id: string) => skipped.find((s) => s.id === id)?.reason ?? "(accepted)";
    check("bulk: accepts the valid request", r.status === 200 && r.json.count === 1 && (await prisma.appointment.findUnique({ where: { id: fine.id } }))?.status === "SCHEDULED", `${r.status} count ${r.json.count}`);
    check("bulk: skips the leave-day request", reason(onLeave.id).includes("leave"), reason(onLeave.id));
    check("bulk: skips the request whose time passed", reason(passed.id).includes("already passed"), reason(passed.id));
    check("bulk: skips the request at a deactivated clinic", reason(atClosed.id).includes("no longer active"), reason(atClosed.id));

    // ── Reassignment: video ──
    const vTime = at(day, "11:00");
    const original = await doctor("Cancelling Doctor", { offersVideo: true, lat: 18.5, lng: 73.8, availability: "Sun-Sat, 12AM-11:59PM" });
    const offHours = await doctor("Evening Doctor", { offersVideo: true, lat: 18.501, lng: 73.8, availability: "Mon, Tue, Wed, Thu, Fri 18:00–21:00" });
    const busy = await doctor("Busy Doctor", { offersVideo: true, lat: 18.502, lng: 73.8, availability: "Sun-Sat, 12AM-11:59PM" });
    const free = await doctor("Free Doctor", { offersVideo: true, lat: 18.6, lng: 73.8, availability: "Sun-Sat, 12AM-11:59PM" });
    await appt(busy.id, { status: "SCHEDULED", scheduledAt: vTime, createdAt: new Date(Date.now() - DAY) });
    const video = await appt(original.id, { status: "SCHEDULED", scheduledAt: vTime, createdAt: new Date(Date.now() - DAY) });
    r = await call(original, "PATCH", `/api/appointments/${video.id}`, { status: "CANCELLED" });
    const movedTo = (await prisma.appointment.findFirst({ where: { reassignedFromId: video.id } }))?.doctorId;
    const who = (id?: string) => ({ [offHours.id]: "evening doctor", [busy.id]: "busy doctor", [free.id]: "free doctor", [acceptor.id]: "accepting doctor" } as Record<string, string>)[id ?? ""] ?? id ?? "nobody";
    check("video: skips the nearer doctor outside their hours and the one with a clash", r.status === 200 && movedTo === free.id, `${r.status} → ${who(movedTo)}`);

    // ── Reassignment: clinic ──
    const cTime = at(day, "10:00");
    const cOriginal = await doctor("Cancelling Clinic Doctor", { offersVideo: false, lat: 18.5, lng: 73.8 });
    const cOrigClinic = await clinicFor(cOriginal.id, "Original Clinic", 18.5);
    const leaveDoc = await doctor("Leave Doctor", { lat: 18.5005, lng: 73.8 });
    await clinicFor(leaveDoc.id, "Leave Clinic", 18.5005, ALL_DAYS, [day]);
    const wrongDayDoc = await doctor("Weekend Doctor", { lat: 18.501, lng: 73.8 });
    await clinicFor(wrongDayDoc.id, "Weekend Clinic", 18.501, ["Sat", "Sun"]);
    const openDoc = await doctor("Open Clinic Doctor", { lat: 18.52, lng: 73.8 });
    const openDocClinic = await clinicFor(openDoc.id, "Open Weekday Clinic", 18.52);
    const clinicVisit = await appt(cOriginal.id, { status: "SCHEDULED", consultType: "CLINIC", clinicId: cOrigClinic.id, scheduledAt: cTime, createdAt: new Date(Date.now() - DAY) });
    r = await call(cOriginal, "PATCH", `/api/appointments/${clinicVisit.id}`, { status: "CANCELLED" });
    const cMoved = await prisma.appointment.findFirst({ where: { reassignedFromId: clinicVisit.id } });
    const cWho = ({ [leaveDoc.id]: "doctor on leave", [wrongDayDoc.id]: "weekend-only doctor", [openDoc.id]: "open doctor" } as Record<string, string>)[cMoved?.doctorId ?? ""] ?? "nobody";
    check("clinic: skips a clinic on leave that day and one closed that weekday", r.status === 200 && cMoved?.doctorId === openDoc.id && cMoved.clinicId === openDocClinic.id, `${r.status} → ${cWho}`);

    // Nobody works then → cancelled and refunded, no replacement.
    const lonely = await doctor("Only Doctor", { offersVideo: true, lat: 18.5, lng: 73.8, specialty: `${specialty} solo`, availability: "Sun-Sat, 12AM-11:59PM" });
    await doctor("Night Doctor", { offersVideo: true, lat: 18.51, lng: 73.8, specialty: `${specialty} solo`, availability: "Mon, Tue, Wed, Thu, Fri 22:00–23:00" });
    const solo = await appt(lonely.id, { status: "SCHEDULED", scheduledAt: vTime, createdAt: new Date(Date.now() - DAY) });
    r = await call(lonely, "PATCH", `/api/appointments/${solo.id}`, { status: "CANCELLED" });
    const none = await prisma.appointment.findFirst({ where: { reassignedFromId: solo.id } });
    check("no candidate working then → cancelled without reassignment", r.status === 200 && !none, `${r.status} ${none ? "reassigned!" : "not reassigned"}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
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
