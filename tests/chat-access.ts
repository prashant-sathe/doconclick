// Chat after a visit (BUG-TRACKER #36): history stays readable once a visit
// is completed/cancelled, sending stays open for the admin-set follow-up
// window after completion, then it's read-only. Pure checks, then API checks
// against a live dev server and the DB in .env, throwaway users only — the
// live window setting is read, never changed.
//
//   npm run test:chat-access
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { chatState } from "../src/lib/chatAccess";
import { CHAT_FOLLOW_UP_DEFAULT_DAYS } from "../src/lib/bookingHorizon";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 24 * 60 * 60_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

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
type ChatGet = { messages?: unknown[]; chat?: { canSend: boolean; reason: string | null; sendUntil: string | null } };

async function main() {
  // ── The rule ──
  const base = { providerType: "DOCTOR", scheduledAt: daysAgo(1) };
  const s = (status: string, completedAt: Date | null, days = 7, providerType = "DOCTOR") => chatState({ ...base, providerType, status, completedAt }, days);
  check("pending → unreadable", !s("PENDING_APPROVAL", null).canRead, "no read");
  check("scheduled → read + send", s("SCHEDULED", null).canSend, "send");
  check("completed 2 days ago, 7-day window → send", s("COMPLETED", daysAgo(2)).canSend && !!s("COMPLETED", daysAgo(2)).sendUntil, "send");
  check("completed 8 days ago → read-only", s("COMPLETED", daysAgo(8)).canRead && !s("COMPLETED", daysAgo(8)).canSend, "read-only");
  check("window 0 → read-only as soon as completed", !s("COMPLETED", new Date(), 0).canSend, "read-only");
  check("legacy completed (no completedAt) long ago → read-only", !chatState({ ...base, scheduledAt: daysAgo(30), status: "COMPLETED", completedAt: null }, 7).canSend, "read-only");
  for (const st of ["CANCELLED", "REJECTED", "EXPIRED", "NO_SHOW"]) {
    const c = s(st, null);
    check(`${st} → read-only`, c.canRead && !c.canSend && !!c.reason, c.reason ?? "");
  }
  check("nurse wording", (s("PENDING_APPROVAL", null, 7, "NURSE").reason ?? "").includes("nurse accepts"), s("PENDING_APPROVAL", null, 7, "NURSE").reason ?? "");

  // ── API ──
  const window = (await prisma.platformSettings.findFirst({ select: { chatFollowUpDays: true } }))?.chatFollowUpDays ?? CHAT_FOLLOW_UP_DEFAULT_DAYS;
  console.log(`(live follow-up window: ${window} days)`);
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `7${stamp}${n++}`, ...data } as never });
    ids.push(u.id);
    return u;
  };
  const doctor = await mk({
    name: "Chat Doctor", role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY) } },
  });
  const patient = await mk({ name: "Chat Patient", role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 30, gender: "Male" } } });
  const admin = await mk({ name: "Chat Admin", role: "ADMIN" });
  const appt = (status: string, extra: Record<string, unknown> = {}) => prisma.appointment.create({
    data: { doctorId: doctor.id, patientId: patient.id, status, scheduledAt: daysAgo(1), symptoms: "cough", amount: 500, consultType: "VIDEO", paymentMethod: "CASH", ...extra } as never,
  });
  const read = async (u: U, id: string) => {
    const r = await call(u, "GET", `/api/appointments/${id}/messages`);
    return { status: r.status, error: r.json.error ?? "", code: r.json.code, ...(r.json as ChatGet) };
  };
  const send = (u: U, id: string, text: string) => call(u, "POST", `/api/appointments/${id}/messages`, { text });

  try {
    const pending = await appt("PENDING_APPROVAL");
    let g = await read(patient, pending.id);
    check("pending: read → 403 CHAT_CLOSED", g.status === 403 && g.code === "CHAT_CLOSED", `${g.status} ${g.error}`);
    let r = await send(patient, pending.id, "hi");
    check("pending: send → 403", r.status === 403, `${r.status}`);

    const live = await appt("SCHEDULED");
    r = await send(patient, live.id, "Is it okay to eat before the call?");
    check("scheduled: patient sends → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    g = await read(doctor, live.id);
    check("scheduled: GET returns { messages, chat } with canSend", g.status === 200 && g.messages?.length === 1 && g.chat?.canSend === true && g.chat.sendUntil === null, `${g.status} ${JSON.stringify(g.chat)}`);

    r = await call(doctor, "PATCH", `/api/appointments/${live.id}`, { status: "COMPLETED" });
    check("doctor completes the visit", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    g = await read(patient, live.id);
    if (window > 0) {
      const until = g.chat?.sendUntil ? new Date(g.chat.sendUntil).getTime() : 0;
      check(`completed: history readable, follow-up open ~${window} days`, g.status === 200 && g.messages?.length === 1 && g.chat?.canSend === true
        && Math.abs(until - (Date.now() + window * DAY)) < 5 * 60_000, `${g.status} ${g.chat?.sendUntil}`);
      r = await send(patient, live.id, "The rash is still there today.");
      check("completed, inside the window: patient sends → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
      r = await send(doctor, live.id, "Send a photo please.");
      check("…doctor replies → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    } else {
      check("completed with a 0-day window: read-only", g.status === 200 && g.chat?.canSend === false, `${JSON.stringify(g.chat)}`);
    }

    // Window ran out.
    await prisma.appointment.update({ where: { id: live.id }, data: { completedAt: daysAgo(window + 1) } });
    g = await read(patient, live.id);
    check("after the window: history still readable", g.status === 200 && (g.messages?.length ?? 0) >= 1, `${g.status} ${g.messages?.length} messages`);
    check("…but read-only, with the reason", g.chat?.canSend === false && (g.chat.reason ?? "").length > 0, g.chat?.reason ?? "");
    r = await send(patient, live.id, "one more thing");
    check("…patient send → 403 CHAT_CLOSED", r.status === 403 && r.json.code === "CHAT_CLOSED", `${r.status} ${r.json.error}`);
    r = await send(doctor, live.id, "one more thing");
    check("…doctor send → 403 CHAT_CLOSED", r.status === 403 && r.json.code === "CHAT_CLOSED", `${r.status}`);
    const up = await fetch(`${BASE}/api/appointments/${live.id}/messages/upload`, { method: "POST", headers: { Cookie: cookieFor(patient) }, body: new FormData() });
    check("…file upload → 403", up.status === 403, `${up.status}`);
    r = await call(doctor, "PATCH", `/api/appointments/${live.id}/messages/read`);
    check("…marking read still works", r.status === 200, `${r.status}`);

    const legacy = await appt("COMPLETED", { scheduledAt: daysAgo(window + 5) });
    g = await read(patient, legacy.id);
    check("legacy completed (no completedAt): read-only", g.status === 200 && g.chat?.canSend === false, JSON.stringify(g.chat));

    const cancelled = await appt("CANCELLED");
    await prisma.message.create({ data: { appointmentId: cancelled.id, senderId: patient.id, text: "before it was cancelled" } });
    g = await read(doctor, cancelled.id);
    check("cancelled: history readable, read-only", g.status === 200 && g.messages?.length === 1 && g.chat?.canSend === false && (g.chat.reason ?? "").includes("cancelled"), `${g.status} ${g.chat?.reason}`);
    r = await send(doctor, cancelled.id, "hello?");
    check("cancelled: send → 403", r.status === 403, `${r.status}`);

    // ── Admin setting (validation only — the live value is left alone) ──
    const st = await call(admin, "GET", "/api/admin/settings");
    check("admin settings expose chatFollowUpDays", st.json.chatFollowUpDays === window, `${st.json.chatFollowUpDays}`);
    for (const bad of [-1, 31, 2.5, "7"]) {
      r = await call(admin, "PATCH", "/api/admin/settings", { chatFollowUpDays: bad });
      check(`admin follow-up ${JSON.stringify(bad)} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
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
