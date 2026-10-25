// Complaint tickets (BUG-TRACKER #46, FP1-17).
//  - Admin status updates: validated against the allowed list, unknown ids are
//    a 404 (never a 500), and the filer is notified only on real changes.
//  - Ticketing: filer threads (patient, nurse, doctor), internal notes never
//    reaching the filer, assignee/priority/linked booking, contact number,
//    SLA filter, reopen-on-reply, notifications, rate and size limits.
//
// Starts its OWN dev server (own port + distDir, tests/devServer.ts — the
// owner's server and its in-memory rate limiters are untouched) with Firebase
// credentials blanked, so no real push is sent to anyone. Notifications are
// checked through the inbox rows (Notification) every push writes first.
// Set BASE_URL to run against an already-running server instead. DB in .env,
// throwaway users only.
//
//   npm run test:complaints
import "dotenv/config";
import jwt from "jsonwebtoken";
import type { ChildProcess } from "child_process";
import { prisma } from "../src/lib/prisma";
import { startDevServer } from "./devServer";

let BASE = process.env.BASE_URL ?? "";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; status?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(as ? { Cookie: cookieFor(as) } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: J = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}
const patch = (as: U, body: unknown) => call(as, "PATCH", "/api/admin/complaints", body);

const settle = () => new Promise((r) => setTimeout(r, 1500)); // pushes are fire-and-forget
const inbox = (userId: string, kind: string) => prisma.notification.count({ where: { userId, kind } });

async function main() {
  let server: ChildProcess | null = null;
  if (!BASE) {
    const started = await startDevServer({ env: { FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" }, label: "complaints" });
    server = started.child;
    BASE = started.base;
  }

  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  const complaintIds: string[] = [];
  const mk = async (n: number, data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `1${stamp}${n}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const admin = await mk(1, { name: "Complaint Admin", role: "ADMIN" });
  const admin2 = await mk(2, { name: "Complaint Admin Two", role: "ADMIN" });
  const patient = await mk(3, { name: "Complaint Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const intruder = await mk(4, { name: "Other Patient", role: "PATIENT", patientProfile: { create: { age: 40, gender: "Female" } } });
  const nurse = await mk(5, { name: "Complaint Nurse", role: "NURSE" });
  const doctor = await mk(6, { name: "Complaint Doctor", role: "DOCTOR" });
  const ownAppt = await prisma.appointment.create({ data: { patientId: patient.id, doctorId: doctor.id, symptoms: "test" } });
  const otherAppt = await prisma.appointment.create({ data: { patientId: intruder.id, doctorId: doctor.id, symptoms: "test" } });
  const legacy = await prisma.complaint.create({ data: { userId: patient.id, subject: "Payment didn't go through", description: "Charged twice" } });
  complaintIds.push(legacy.id);

  try {
    // ── Status validation (BUG-TRACKER #46) ──
    let r = await patch(admin, { id: legacy.id, status: "DELETED" });
    check("unknown status → 400", r.status === 400 && r.json.error === "Invalid status", `${r.status} ${r.json.error}`);
    r = await patch(admin, { id: legacy.id, status: "resolved" });
    check("wrong case → 400 (the list is exact)", r.status === 400, `${r.status}`);
    r = await patch(admin, { id: legacy.id });
    check("missing status → 400", r.status === 400, `${r.status}`);
    r = await patch(admin, { status: "RESOLVED" });
    check("missing id → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await patch(admin, { id: { not: "a string" }, status: "RESOLVED" });
    check("non-string id → 400", r.status === 400, `${r.status}`);
    r = await patch(admin, "{not json");
    check("malformed JSON → 400", r.status === 400, `${r.status}`);
    r = await patch(admin, { id: "no-such-complaint", status: "RESOLVED" });
    check("unknown id → 404, not 500", r.status === 404 && r.json.error === "Complaint not found", `${r.status} ${r.json.error}`);
    r = await patch(patient, { id: legacy.id, status: "RESOLVED" });
    check("a patient can't change it (403)", r.status === 403, `${r.status}`);
    check("…nothing changed by any of those", (await prisma.complaint.findUniqueOrThrow({ where: { id: legacy.id } })).status === "OPEN", "still OPEN");

    // ── Status pushes only on real changes ──
    const upd = () => inbox(patient.id, "complaintUpdate");
    r = await patch(admin, { id: legacy.id, status: "OPEN" });
    await settle();
    check("setting the status it already has → 200, no notification", r.status === 200 && r.json.status === "OPEN" && (await upd()) === 0, `${r.status} ${await upd()}`);
    r = await patch(admin, { id: legacy.id, status: "IN_PROGRESS" });
    await settle();
    check("OPEN → IN_PROGRESS → 200, one notification", r.status === 200 && (await upd()) === 1, `${r.status} ${await upd()}`);
    const n1 = await prisma.notification.findFirst({ where: { userId: patient.id, kind: "complaintUpdate" } });
    check("…linking to the patient's ticket thread", n1?.url === `/patient/support/${legacy.id}`, String(n1?.url));
    const both = await Promise.all([patch(admin, { id: legacy.id, status: "RESOLVED" }), patch(admin, { id: legacy.id, status: "RESOLVED" })]);
    await settle();
    check("two simultaneous RESOLVED → both 200, one more notification", both.every((x) => x.status === 200) && (await upd()) === 2, `${both.map((x) => x.status)} ${await upd()}`);
    check("…resolvedAt set", !!(await prisma.complaint.findUniqueOrThrow({ where: { id: legacy.id } })).resolvedAt, "set");

    // ── Filing: linked booking, contact number, text cleanup ──
    const create = (as: U, body: unknown) => call(as, "POST", "/api/patient/complaints", body);
    r = await create(patient, { subject: "Bad", description: "x", appointmentId: otherAppt.id });
    check("linking someone else's booking → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await create(patient, { subject: "Bad", description: "x", contactMobile: "12345" });
    check("invalid callback number → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await create(patient, { subject: "  Doctor was late\u0000\u202E ", description: `Waited ${stamp}\r\n\r\n\r\n\r\nfor an hour`, appointmentId: ownAppt.id, contactMobile: "+91 98765 43210" });
    const ticketId = String(r.json.id);
    complaintIds.push(ticketId);
    check("patient files a ticket about their own booking → 201", r.status === 201 && r.json.appointmentId === ownAppt.id, `${r.status} ${r.json.appointmentId}`);
    check("…control/bidi characters stripped", r.json.subject === "Doctor was late", JSON.stringify(r.json.subject));
    check("…blank lines collapsed", r.json.description === `Waited ${stamp}\n\nfor an hour`, JSON.stringify(r.json.description));
    check("…callback number normalised", r.json.contactMobile === "9876543210", String(r.json.contactMobile));
    check("…filer response has no priority/assignee", !("priority" in r.json) && !("assigneeId" in r.json), Object.keys(r.json).join(","));
    await settle();
    const newNote = await prisma.notification.findFirst({ where: { userId: admin.id, kind: "adminComplaintNew" } });
    check("admins are notified of the new ticket", newNote?.url === `/admin/complaints/${ticketId}`, String(newNote?.url));

    r = await call(patient, "GET", "/api/complaints/appointments");
    const linkIds = Array.isArray(r.json) ? (r.json as unknown as { id: string }[]).map((a) => a.id) : [];
    check("linkable bookings: own only", linkIds.includes(ownAppt.id) && !linkIds.includes(otherAppt.id), linkIds.join(","));

    r = await create(nurse, { subject: `Nurse issue ${stamp}`, description: "Payout late" });
    const nurseTicketId = String(r.json.id);
    complaintIds.push(nurseTicketId);
    check("nurse files a ticket → 201", r.status === 201, `${r.status}`);
    r = await call(nurse, "GET", "/api/patient/complaints");
    const nurseList = r.json as unknown as { id: string }[];
    check("nurse's list has only their ticket", Array.isArray(nurseList) && nurseList.length === 1 && nurseList[0].id === nurseTicketId, JSON.stringify(nurseList).slice(0, 80));

    // ── Who can open a thread ──
    r = await call(patient, "GET", `/api/complaints/${ticketId}`);
    check("filer opens their thread → 200 with booking summary", r.status === 200 && (r.json.appointment as { id?: string } | null)?.id === ownAppt.id, `${r.status}`);
    r = await call(intruder, "GET", `/api/complaints/${ticketId}`);
    check("another patient → 404", r.status === 404, `${r.status}`);
    r = await call(nurse, "GET", `/api/complaints/${ticketId}`);
    check("a nurse on a patient's ticket → 404", r.status === 404, `${r.status}`);
    r = await call(null, "GET", `/api/complaints/${ticketId}`);
    check("signed out → 401", r.status === 401, `${r.status}`);
    r = await call(intruder, "POST", `/api/complaints/${ticketId}/messages`, { body: "let me in" });
    check("another patient can't reply → 404", r.status === 404, `${r.status}`);
    r = await call(patient, "GET", `/api/admin/complaints/${ticketId}`);
    check("filer can't open the admin view → 403", r.status === 403, `${r.status}`);
    r = await call(patient, "POST", `/api/admin/complaints/${ticketId}/messages`, { body: "x", internal: false });
    check("filer can't post as support → 403", r.status === 403, `${r.status}`);

    // ── Internal note vs public reply ──
    const secret = `INTERNAL-${stamp}`;
    r = await call(admin, "POST", `/api/admin/complaints/${ticketId}/messages`, { body: secret, internal: true });
    check("admin adds an internal note → 201", r.status === 201 && r.json.internal === true, `${r.status}`);
    await settle();
    r = await call(patient, "GET", `/api/complaints/${ticketId}`);
    check("…never in the filer's thread", r.status === 200 && !r.text.includes(secret) && !r.text.includes("internal"), `${r.status}`);
    check("…no notification, SLA clock still running", (await inbox(patient.id, "complaintReply")) === 0 && !(await prisma.complaint.findUniqueOrThrow({ where: { id: ticketId } })).firstResponseAt, "ok");
    r = await call(patient, "GET", "/api/patient/complaints");
    check("…nor in the filer's list", !r.text.includes(secret), "ok");

    r = await call(admin, "POST", `/api/admin/complaints/${ticketId}/messages`, { body: "Sorry — we're looking into it." });
    check("admin replies publicly → 201", r.status === 201 && r.json.internal === false, `${r.status}`);
    await settle();
    r = await call(patient, "GET", `/api/complaints/${ticketId}`);
    const msgs = (r.json.messages ?? []) as { fromSupport: boolean; body: string; author?: unknown }[];
    check("…filer sees it as from support, no admin identity", msgs.length === 1 && msgs[0].fromSupport && !("author" in msgs[0]) && !r.text.includes(admin.id), JSON.stringify(msgs).slice(0, 100));
    check("…filer view has no priority/assignee", !("priority" in r.json) && !("assigneeId" in r.json) && !("assignee" in r.json), Object.keys(r.json).join(","));
    const reply = await prisma.notification.findFirst({ where: { userId: patient.id, kind: "complaintReply" } });
    check("…filer notified, linking to the thread", reply?.url === `/patient/support/${ticketId}`, String(reply?.url));
    check("…first response recorded", !!(await prisma.complaint.findUniqueOrThrow({ where: { id: ticketId } })).firstResponseAt, "set");

    // ── Triage fields ──
    r = await patch(admin, { id: ticketId, priority: "SUPER" });
    check("invalid priority → 400", r.status === 400, `${r.status}`);
    r = await patch(admin, { id: ticketId, assigneeId: patient.id });
    check("assigning to a non-admin → 400", r.status === 400, `${r.status}`);
    r = await patch(admin, { id: ticketId, appointmentId: "no-such-appt" });
    check("linking an unknown booking → 400", r.status === 400, `${r.status}`);
    r = await patch(admin, { id: ticketId, priority: "HIGH", assigneeId: admin2.id });
    await settle();
    check("set priority + assignee → 200", r.status === 200 && r.json.priority === "HIGH" && r.json.assigneeId === admin2.id, `${r.status} ${r.json.priority}`);
    check("…assignee notified", (await inbox(admin2.id, "adminComplaintAssigned")) === 1, String(await inbox(admin2.id, "adminComplaintAssigned")));
    check("…filer not notified of triage", (await upd()) === 2, String(await upd()));

    // ── Filer replies; reopen on reply ──
    const adminReplies = await inbox(admin.id, "adminComplaintReply");
    r = await call(patient, "POST", `/api/complaints/${ticketId}/messages`, { body: "Any update?" });
    await settle();
    check("filer replies → 201", r.status === 201, `${r.status}`);
    check("…only the assignee is notified", (await inbox(admin2.id, "adminComplaintReply")) === 1 && (await inbox(admin.id, "adminComplaintReply")) === adminReplies, "ok");
    r = await call(patient, "POST", `/api/complaints/${ticketId}/messages`, { body: "   \n\u0000 " });
    check("blank reply → 400", r.status === 400, `${r.status}`);
    r = await call(patient, "POST", `/api/complaints/${ticketId}/messages`, "{bad");
    check("malformed JSON → 400", r.status === 400, `${r.status}`);
    r = await call(patient, "POST", `/api/complaints/${ticketId}/messages`, { body: "y".repeat(10_000) });
    check("oversized reply stored capped at 4000", r.status === 201 && (r.json.message as { body: string }).body.length === 4000, `${r.status}`);
    await patch(admin, { id: ticketId, status: "RESOLVED" });
    r = await call(patient, "POST", `/api/complaints/${ticketId}/messages`, { body: "Still not fixed" });
    const reopened = await prisma.complaint.findUniqueOrThrow({ where: { id: ticketId } });
    check("replying to a resolved ticket reopens it", r.status === 201 && r.json.status === "OPEN" && reopened.status === "OPEN" && !reopened.resolvedAt, `${r.json.status}`);

    // Rate limit: 10 replies per 10 minutes per user (3 accepted above; rejected bodies don't count).
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await call(patient, "POST", `/api/complaints/${ticketId}/messages`, { body: `spam ${i}` })).status);
    check("reply flood → 429", codes.includes(429) && codes.filter((c) => c === 201).length === 7, codes.join(","));

    // ── Doctor (files through the Support Assistant) ──
    const drTicket = await prisma.complaint.create({ data: { userId: doctor.id, subject: `Doctor issue ${stamp}`, description: "Payout" } });
    complaintIds.push(drTicket.id);
    r = await call(doctor, "GET", "/api/doctor/complaints");
    check("doctor lists their ticket", Array.isArray(r.json) && (r.json as unknown as { id: string }[]).some((c) => c.id === drTicket.id), `${r.status}`);
    r = await call(doctor, "POST", `/api/complaints/${drTicket.id}/messages`, { body: "Hello?" });
    check("doctor replies on their thread → 201", r.status === 201, `${r.status}`);
    await call(admin, "POST", `/api/admin/complaints/${drTicket.id}/messages`, { body: "Hi doctor" });
    await settle();
    const drNote = await prisma.notification.findFirst({ where: { userId: doctor.id, kind: "complaintReply" } });
    check("…doctor's notification links to their thread", drNote?.url === `/doctor/support/tickets/${drTicket.id}`, String(drNote?.url));

    // ── Admin list filters + SLA ──
    const old = await prisma.complaint.create({ data: { userId: nurse.id, subject: `Old ${stamp}`, description: "x", createdAt: new Date(Date.now() - 5 * 86400_000) } });
    complaintIds.push(old.id);
    const list = async (qs: string) => {
      const res = await call(admin, "GET", `/api/admin/complaints?${qs}`);
      return ((res.json.complaints ?? []) as { id: string; sla: { breached: boolean } }[]);
    };
    let rows = await list(`q=${stamp}`);
    check("search by text finds the tickets", rows.some((c) => c.id === ticketId) && rows.some((c) => c.id === nurseTicketId), `${rows.length}`);
    rows = await list(`assignee=${admin2.id}&status=`);
    check("filter by assignee", rows.some((c) => c.id === ticketId) && !rows.some((c) => c.id === nurseTicketId), `${rows.length}`);
    rows = await list(`q=${stamp}&role=NURSE`);
    check("filter by role", rows.some((c) => c.id === nurseTicketId) && !rows.some((c) => c.id === ticketId), `${rows.length}`);
    rows = await list(`q=${stamp}&priority=LOW`);
    check("filter by priority", rows.length === 0, `${rows.length}`);
    rows = await list(`q=${stamp}&sla=breached`);
    check("SLA breached: the 5-day-old unanswered ticket only", rows.length === 1 && rows[0].id === old.id && rows[0].sla.breached, rows.map((c) => c.id).join(","));
    r = await call(patient, "GET", "/api/admin/complaints");
    check("filer can't list all tickets → 403", r.status === 403, `${r.status}`);

    r = await call(admin, "GET", `/api/admin/complaints/${ticketId}`);
    check("admin detail includes the internal note and contact", r.status === 200 && r.text.includes(secret) && r.json.contactMobile === "9876543210" && (r.json.user as { mobile?: string }).mobile === patient.mobile, `${r.status}`);

    // Ticket creation limit: 5 per hour per user (the nurse has used 1).
    const created: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await create(nurse, { subject: `Flood ${stamp} ${i}`, description: "x" });
      if (res.json.id) complaintIds.push(String(res.json.id));
      created.push(res.status);
    }
    check("ticket flood → 429 after 5 in an hour", created.filter((c) => c === 201).length === 4 && created[4] === 429, created.join(","));
  } finally {
    server?.kill();
    // Inbox rows for every admin (incl. real local ones) that point at our tickets.
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, ...complaintIds.map((id) => ({ url: { contains: id } }))] } });
    await prisma.complaint.deleteMany({ where: { OR: [{ userId: { in: ids } }, { id: { in: complaintIds } }] } });
    await prisma.appointment.deleteMany({ where: { id: { in: [ownAppt.id, otherAppt.id] } } });
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
