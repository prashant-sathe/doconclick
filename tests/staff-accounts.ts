// Staff (receptionist) accounts (BUG-TRACKER #59): creating one with a mobile
// that's already registered gives the same generic answer whoever owns it
// (no account lookup), attempts are rate-limited, a doctor can rename and
// delete their staff (delete = signed out, number freed, chats kept), and the
// queue API gives STAFF no nurse vitals. Against a live dev server and the DB
// in .env, throwaway users only.
//
//   npm run test:staff-accounts
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

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
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}

async function main() {
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  // Real-looking mobiles (6–9 + 9 digits) so they pass validation.
  const mob = () => `9${stamp}${String(n++).padStart(2, "0")}`;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: mob(), termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const profile = (extra: Record<string, unknown> = {}) => ({ create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), ...extra } });
  const doctor = await mk({ name: "Staff Doctor", role: "DOCTOR", doctorProfile: profile() });
  const other = await mk({ name: "Other Doctor", role: "DOCTOR", doctorProfile: profile() });
  const expired = await mk({ name: "Expired Doctor", role: "DOCTOR", doctorProfile: profile({ trialEndsAt: new Date(Date.now() - DAY) }) });
  const patient = await mk({ name: "Staff Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const nurse = await mk({ name: "Staff Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });
  const createStaff = (by: U, mobile: string, name = "Front Desk") => call(by, "POST", "/api/doctor/staff", { name, mobile, password: "secret123" });
  const track = (r: { json: J }) => { if (typeof r.json.userId === "string") ids.push(r.json.userId); return r; };

  try {
    // ── Creating ──
    const desk = track(await createStaff(doctor, mob(), "Asha Front Desk"));
    check("create a staff account → 200", desk.status === 200 && typeof desk.json.userId === "string", `${desk.status} ${desk.json.error ?? ""}`);
    const otherDesk = track(await createStaff(other, mob()));
    const answers = [];
    for (const [who, mobile] of [["a patient", patient.mobile], ["a doctor", other.mobile], ["a nurse", nurse.mobile], ["another doctor's staff", otherDesk.json.mobile as string]] as const) {
      const r = await createStaff(doctor, mobile);
      answers.push(r);
      check(`mobile already used by ${who} → 409 MOBILE_UNAVAILABLE`, r.status === 409 && r.json.code === "MOBILE_UNAVAILABLE", `${r.status} ${r.json.error}`);
    }
    check("…the same message every time, not saying an account exists", new Set(answers.map((a) => a.json.error)).size === 1 && !/exist|registered|account with/i.test(String(answers[0].json.error)), String(answers[0].json.error));
    const spammer = await mk({ name: "Spam Doctor", role: "DOCTOR", doctorProfile: profile() });
    let blockedAt = 0;
    for (let i = 1; i <= 11; i++) {
      const r = await createStaff(spammer, patient.mobile);
      if (r.status === 429) { blockedAt = i; break; }
    }
    check("10 attempts an hour per doctor, the 11th → 429", blockedAt === 11, `first 429 at ${blockedAt}`);

    const deskId = desk.json.userId as string;
    const staffUser: U = { id: deskId, name: "Asha Front Desk", role: "STAFF", mobile: desk.json.mobile as string };

    // ── Rename ──
    let r = await call(doctor, "PATCH", `/api/doctor/staff/${deskId}`, { name: "  Asha   Patil " });
    check("rename → 200, trimmed and single-spaced", r.status === 200 && r.json.name === "Asha Patil" && (await prisma.user.findUniqueOrThrow({ where: { id: deskId } })).name === "Asha Patil", `${r.status} ${JSON.stringify(r.json.name)}`);
    for (const [label, name] of [["one letter", "A"], ["blank", "   "], ["a number", 42], ["too long", "x".repeat(81)]] as const) {
      r = await call(doctor, "PATCH", `/api/doctor/staff/${deskId}`, { name });
      check(`rename to ${label} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    r = await call(doctor, "PATCH", `/api/doctor/staff/${deskId}`, {});
    check("PATCH with nothing to change → 400", r.status === 400, `${r.status}`);
    r = await call(doctor, "PATCH", `/api/doctor/staff/${deskId}`, { active: "no" });
    check("active must be a boolean → 400", r.status === 400, `${r.status}`);
    r = await call(other, "PATCH", `/api/doctor/staff/${deskId}`, { name: "Hijacked" });
    check("another doctor can't rename them → 404", r.status === 404, `${r.status}`);
    const expDesk = await mk({ name: "Old Desk", role: "STAFF", staffAccount: { create: { doctorId: expired.id } } });
    r = await call(expired, "PATCH", `/api/doctor/staff/${expDesk.id}`, { name: "Renamed Desk" });
    check("a doctor without a plan can still rename (or revoke)…", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(expired, "PATCH", `/api/doctor/staff/${expDesk.id}`, { active: true });
    check("…but not give access back", r.status === 403, `${r.status}`);

    // ── Staff see no nurse vitals ──
    const appt = await prisma.appointment.create({ data: { doctorId: doctor.id, patientId: patient.id, symptoms: "x", consultType: "CLINIC", status: "SCHEDULED", amount: 300, platformFee: 30, paymentMethod: "CASH", scheduledAt: new Date(Date.now() + DAY) } as never });
    await prisma.vitalReading.create({ data: { patientId: patient.id, recordedById: nurse.id, recordedAt: new Date(Date.now() - DAY), systolic: 150, diastolic: 95 } as never });
    const asDoctor = ((await call(doctor, "GET", "/api/appointments/me?view=active")).json as unknown as { id: string; latestVitals: unknown }[]).find((a) => a.id === appt.id);
    const asStaff = ((await call(staffUser, "GET", "/api/appointments/me?view=active")).json as unknown as { id: string; latestVitals: unknown; recentVitalsCount: number }[]).find((a) => a.id === appt.id);
    check("doctor's queue shows the nurse vitals; the receptionist's doesn't", !!asDoctor?.latestVitals && asStaff !== undefined && asStaff.latestVitals === null && asStaff.recentVitalsCount === 0, `doctor ${!!asDoctor?.latestVitals} / staff ${JSON.stringify(asStaff?.latestVitals)}`);

    // ── Delete ──
    await prisma.message.create({ data: { appointmentId: appt.id, senderId: deskId, text: "Please arrive 10 minutes early" } });
    r = await call(other, "DELETE", `/api/doctor/staff/${deskId}`);
    check("another doctor can't delete them → 404", r.status === 404, `${r.status}`);
    r = await call(doctor, "DELETE", `/api/doctor/staff/${deskId}`);
    const gone = await prisma.user.findUniqueOrThrow({ where: { id: deskId }, include: { staffAccount: true } });
    check("delete → 200: soft-deleted, mobile freed, password cleared, access off", r.status === 200 && !!gone.deletedAt && gone.mobile.startsWith("deleted_") && gone.password === "" && gone.staffAccount?.active === false, `${r.status} ${gone.mobile} ${gone.staffAccount?.active}`);
    const list = (await call(doctor, "GET", "/api/doctor/staff")).json as unknown as { userId: string }[];
    check("…gone from the doctor's staff list", Array.isArray(list) && !list.some((s) => s.userId === deskId), `${list.length}`);
    const me = await call(staffUser, "GET", "/api/appointments/me?view=active");
    check("…their session no longer works", me.status === 401, `${me.status}`);
    const msg = await prisma.message.findFirst({ where: { senderId: deskId }, include: { sender: { select: { name: true } } } });
    check("…messages they sent stay in the chat, under their name", msg?.text === "Please arrive 10 minutes early" && msg.sender.name === "Asha Patil", `${msg?.sender.name}`);
    r = await call(doctor, "DELETE", `/api/doctor/staff/${deskId}`);
    check("deleting again → 404", r.status === 404, `${r.status}`);
    r = await call(doctor, "PATCH", `/api/doctor/staff/${deskId}`, { name: "Back Again" });
    check("…and a deleted account can't be edited", r.status === 404, `${r.status}`);
    const again = track(await createStaff(doctor, staffUser.mobile, "New Desk"));
    check("the freed number can be used for a new staff account", again.status === 200, `${again.status} ${again.json.error ?? ""}`);
  } finally {
    await prisma.message.deleteMany({ where: { senderId: { in: ids } } });
    await prisma.vitalReading.deleteMany({ where: { patientId: { in: ids } } });
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
