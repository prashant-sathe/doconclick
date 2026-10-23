// In-app notification inbox: every push (sendPushToUsers) leaves one
// Notification row per recipient — in that recipient's language, whether or
// not they have a push token — for every role; GET /api/notifications lists
// only your own, newest first, paginated; unread-count and read (some ids or
// all) only touch your own; a real push route (pay reminder) lands in the
// inbox; each role's /…/inbox page opens for that role (STAFF via the doctor
// area). Against a live dev server and the DB in .env, throwaway users only.
//
//   npm run test:inbox        (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { sendPushToUsers } from "../src/lib/firebaseAdmin";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const HOUR = 3600e3, DAY = 24 * HOUR;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}
const settle = () => new Promise((r) => setTimeout(r, 1500));

type U = { id: string; name: string; role: string; mobile: string };
type Item = { id: string; title: string; body: string; url: string; kind: string | null; readAt: string | null };
type J = Record<string, unknown> & { error?: string; items?: Item[]; unreadCount?: number; nextCursor?: string | null; count?: number };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { ...(as ? { Cookie: cookieFor(as) } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, location: res.headers.get("location"), json: (await res.json().catch(() => ({}))) as J };
}
const rows = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });

async function main() {
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `6${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const patient = await mk({ name: "Inbox Patient", role: "PATIENT", language: "hi-IN", patientProfile: { create: { age: 30, gender: "Male" } } });
  const doctor = await mk({ name: "Inbox Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), offersHomeVisit: true } } });
  const desk = await mk({ name: "Inbox Desk", role: "STAFF", language: "mr-IN" });
  await prisma.staffProfile.create({ data: { userId: desk.id, doctorId: doctor.id } });
  const nurse = await mk({ name: "Inbox Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED", isVerified: true } } });
  const admin = await mk({ name: "Inbox Admin", role: "ADMIN" });
  const everyone = [patient, doctor, desk, nurse, admin];

  try {
    // ── Every push is recorded, per recipient, in their language ──
    await sendPushToUsers([...everyone.map((u) => u.id), "no-such-user"], { key: "apptDeclined", values: { doctor: "Dr. Test" }, url: "/patient/appointments" });
    for (const u of everyone) {
      const r = await rows(u.id);
      check(`${u.role}: localized push → one inbox row (no push token needed)`, r.length === 1 && r[0].kind === "apptDeclined" && r[0].url === "/patient/appointments" && r[0].readAt === null, `${r.length} row(s) ${r[0]?.kind}`);
    }
    const [hi] = await rows(patient.id), [mr] = await rows(desk.id), [en] = await rows(doctor.id);
    check("…stored in each recipient's language (en / hi / mr)", en.title === "Request declined" && /[ऀ-ॿ]/.test(hi.title) && /[ऀ-ॿ]/.test(mr.title) && hi.title !== mr.title, `${en.title} | ${hi.title} | ${mr.title}`);
    check("…values interpolated", en.body.includes("Dr. Test") && hi.body.includes("Dr. Test"), en.body);
    check("…an unknown user id is skipped, not fatal", (await prisma.notification.count({ where: { userId: "no-such-user" } })) === 0, "0 rows");

    await sendPushToUsers([doctor.id], { title: "Fixed title", body: "Fixed body", url: "/doctor/dashboard" });
    const [fixed] = await rows(doctor.id);
    check("fixed-text push → recorded with kind null", fixed.title === "Fixed title" && fixed.body === "Fixed body" && fixed.kind === null, `${fixed.title} / ${fixed.kind}`);

    // ── API: own inbox only ──
    let r = await call(null, "GET", "/api/notifications");
    check("signed out → 401", r.status === 401, `${r.status}`);
    for (const u of everyone) {
      r = await call(u, "GET", "/api/notifications");
      const own = (r.json.items ?? []).every((i) => !!i.id);
      check(`${u.role}: GET /api/notifications → 200, own rows + unread count`, r.status === 200 && own && r.json.items!.length === (u === doctor ? 2 : 1) && r.json.unreadCount === r.json.items!.length, `${r.status} ${r.json.items?.length} items, ${r.json.unreadCount} unread`);
    }
    r = await call(doctor, "GET", "/api/notifications");
    check("…newest first", r.json.items![0].title === "Fixed title", r.json.items![0].title);
    r = await call(doctor, "GET", "/api/notifications/unread-count");
    check("unread-count → 2", r.status === 200 && r.json.count === 2, `${r.json.count}`);

    r = await call(patient, "POST", "/api/notifications/read", { ids: [fixed.id] });
    check("marking someone else's notification → no effect on it", r.status === 200 && (await prisma.notification.findUniqueOrThrow({ where: { id: fixed.id } })).readAt === null, `${r.status}`);
    r = await call(doctor, "POST", "/api/notifications/read", { ids: [fixed.id] });
    check("marking one of your own read → unreadCount 1", r.status === 200 && r.json.unreadCount === 1 && !!(await prisma.notification.findUniqueOrThrow({ where: { id: fixed.id } })).readAt, `${r.json.unreadCount}`);
    r = await call(doctor, "POST", "/api/notifications/read", {});
    check("mark all read → unreadCount 0", r.status === 200 && r.json.unreadCount === 0 && (await call(doctor, "GET", "/api/notifications/unread-count")).json.count === 0, `${r.json.unreadCount}`);
    check("…other users untouched", (await call(patient, "GET", "/api/notifications/unread-count")).json.count === 1, "patient still 1 unread");
    r = await call(doctor, "POST", "/api/notifications/read", { ids: "x" });
    check("bad ids → 400", r.status === 400, `${r.status} ${r.json.error}`);

    // ── Pagination ──
    const base = Date.now() - HOUR;
    await prisma.notification.createMany({ data: Array.from({ length: 35 }, (_, i) => ({ userId: nurse.id, title: `Page ${i}`, body: "b", url: "/nurse/dashboard", createdAt: new Date(base + i * 1000) })) });
    const p1 = await call(nurse, "GET", "/api/notifications");
    const p2 = await call(nurse, "GET", `/api/notifications?cursor=${p1.json.nextCursor}`);
    const all = [...p1.json.items!, ...p2.json.items!].map((i) => i.id);
    check("36 rows → pages of 30 + 6, no overlap, then no cursor", p1.json.items!.length === 30 && !!p1.json.nextCursor && p2.json.items!.length === 6 && p2.json.nextCursor === null && new Set(all).size === 36, `${p1.json.items!.length} + ${p2.json.items?.length}, next ${p2.json.nextCursor}`);

    // ── A real push route lands in the inbox ──
    const visit = await prisma.appointment.create({
      data: {
        doctorId: nurse.id, patientId: patient.id, status: "SCHEDULED", consultType: "HOME", symptoms: "INBOX-TEST", amount: 600,
        paymentMethod: "ONLINE", paymentStatus: "PENDING", scheduledAt: new Date(Date.now() + HOUR), acceptedAt: new Date(Date.now() - HOUR),
        providerType: "NURSE", serviceName: "Injection",
      } as never,
    });
    r = await call(nurse, "POST", `/api/appointments/${visit.id}/pay-reminder`);
    await settle();
    const [reminder] = await rows(patient.id);
    check("nurse taps Remind → patient's inbox gets the pay reminder (in Hindi)", r.status === 200 && reminder?.kind === "payReminderManual" && reminder.url.includes(visit.id) && /[ऀ-ॿ]/.test(reminder.title), `${r.status} ${reminder?.kind} ${reminder?.title}`);

    // ── Each role's inbox page ──
    for (const [u, path] of [[patient, "/patient/inbox"], [doctor, "/doctor/inbox"], [desk, "/doctor/inbox"], [nurse, "/nurse/inbox"], [admin, "/admin/inbox"]] as const) {
      r = await call(u, "GET", path);
      check(`${u.role} opens ${path} → 200`, r.status === 200, `${r.status} ${r.location ?? ""}`);
    }
    r = await call(patient, "GET", "/doctor/inbox");
    check("a patient on /doctor/inbox → redirected", r.status >= 300 && r.status < 400, `${r.status} ${r.location}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.staffProfile.deleteMany({ where: { OR: [{ userId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
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
