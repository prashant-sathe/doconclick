// Admin booking actions (POST /api/admin/bookings/[id]/action, F24): cancel
// with a wallet refund, reassign, mark no-show — admin-only, reason required,
// refunded at most once even on a double click, completed bookings rejected,
// a no-show racing the patient's own cancel never both lands. Also the
// per-booking ledger in GET /api/admin/bookings/[id]. Runs against a live dev
// server and the DB in .env with throwaway users (no push tokens, and the
// doctor has no profile, so a reassign never reaches a real doctor) that are
// removed afterwards. The audit fields (who/why) must never reach the patient
// or provider: their appointment reads and wallet history are checked too.
//
//   npm run test:admin-booking-actions   (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { ADMIN_AUDIT_INCLUDE } from "../src/lib/appointmentView";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const FEE = 400;
const PARALLEL = 8;
const REASON = "Patient called support to cancel";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-9);
  const admin = await prisma.user.create({ data: { name: "Action Test Admin", mobile: "4" + stamp, role: "ADMIN" } });
  const doctor = await prisma.user.create({ data: { name: "Action Test Doctor", mobile: "7" + stamp, role: "DOCTOR" } });
  const nurse = await prisma.user.create({ data: { name: "Action Test Nurse", mobile: "9" + stamp, role: "NURSE" } });
  const patient = await prisma.user.create({ data: { name: "Action Test Patient", mobile: "6" + stamp, role: "PATIENT" } });
  // Has a profile + plan, so its own appointment feed and patient view load.
  const planDoctor = await prisma.user.create({
    data: {
      name: "Action Test Plan Doctor", mobile: "8" + stamp, role: "DOCTOR",
      doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * 86400_000) } },
    },
  });
  const ids = [admin.id, doctor.id, nurse.id, patient.id, planDoctor.id];
  const cookieFor = (u: typeof admin) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile }, SECRET)}`;

  const act = async (id: string, body: unknown, cookie: string | null = cookieFor(admin)) => {
    const r = await fetch(`${BASE}/api/admin/bookings/${id}/action`, {
      method: "POST",
      headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const patientCancel = (id: string) => fetch(`${BASE}/api/appointments/${id}`, {
    method: "PATCH",
    headers: { cookie: cookieFor(patient), "Content-Type": "application/json" },
    body: JSON.stringify({ status: "CANCELLED" }),
  }).then((r) => r.status);
  const balance = async () => (await prisma.wallet.findUnique({ where: { userId: patient.id } }))?.balance ?? 0;
  const refunds = (id: string) => prisma.walletTransaction.findMany({ where: { refundOfAppointmentId: id } });
  const mk = (data: Record<string, unknown> = {}) => prisma.appointment.create({
    data: {
      patientId: patient.id, doctorId: doctor.id, symptoms: "admin action test", consultType: "VIDEO",
      status: "SCHEDULED", paymentMethod: "ONLINE", paymentStatus: "PAID", amount: FEE,
      scheduledAt: new Date(Date.now() + 86400_000),
      ...data,
    } as never,
  });
  const tally = (s: number[]) => JSON.stringify(s.reduce<Record<number, number>>((t, x) => ({ ...t, [x]: (t[x] ?? 0) + 1 }), {}));

  try {
    // ── Who may act ──
    const guarded = await mk();
    const anon = await act(guarded.id, { action: "CANCEL", reason: REASON }, null);
    const asPatient = await act(guarded.id, { action: "CANCEL", reason: REASON }, cookieFor(patient));
    const asDoctor = await act(guarded.id, { action: "CANCEL", reason: REASON }, cookieFor(doctor));
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: guarded.id } });
    check("no session → 401", anon.status === 401, `${anon.status}`);
    check("patient → 403", asPatient.status === 403, `${asPatient.status}`);
    check("doctor → 403", asDoctor.status === 403, `${asDoctor.status}`);
    check("non-admin attempts change nothing", after.status === "SCHEDULED" && (await refunds(guarded.id)).length === 0, after.status);

    // ── Input ──
    const noReason = await act(guarded.id, { action: "CANCEL" });
    const shortReason = await act(guarded.id, { action: "CANCEL", reason: "  ab  " });
    const longReason = await act(guarded.id, { action: "CANCEL", reason: "x".repeat(301) });
    const badAction = await act(guarded.id, { action: "REFUND_TWICE", reason: REASON });
    check("reason required", noReason.status === 400 && shortReason.status === 400 && longReason.status === 400, `${noReason.status}/${shortReason.status}/${longReason.status}`);
    check("unknown action → 400", badAction.status === 400, `${badAction.status}`);
    check("missing booking → 404", (await act("nope-" + stamp, { action: "CANCEL", reason: REASON })).status === 404, "404");

    // ── Cancel + refund once ──
    const before = await balance();
    const first = await act(guarded.id, { action: "CANCEL", reason: REASON });
    const again = await act(guarded.id, { action: "CANCEL", reason: REASON });
    const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: guarded.id }, omit: ADMIN_AUDIT_INCLUDE });
    const rows = await refunds(guarded.id);
    check("cancel paid booking → 200 with refund", first.status === 200 && first.json.refund === FEE && cancelled.status === "CANCELLED", `${first.status} refund=${first.json.refund}`);
    check("refunded exactly once", rows.length === 1 && (await balance()) - before === FEE, `${rows.length} row(s), +₹${(await balance()) - before}`);
    check("second cancel → 409", again.status === 409, `${again.status}`);
    check("refund row carries the admin", rows[0]?.adminId === admin.id && rows[0]?.type === "CANCELLATION_REFUND", `${rows[0]?.adminId === admin.id} ${rows[0]?.type}`);
    check("audit on the booking", cancelled.adminActionBy === admin.id && cancelled.adminActionReason === REASON && !!cancelled.adminActionAt, `${cancelled.adminActionReason}`);
    check("refund note doesn't carry the admin's reason", !rows[0]?.note?.includes(REASON), `${rows[0]?.note}`);
    await new Promise((r) => setTimeout(r, 800));
    const inbox = await prisma.notification.findMany({ where: { userId: { in: [patient.id, doctor.id] }, kind: { in: ["apptCancelledByAdmin", "apptCancelledByAdminToProvider"] } } });
    check("patient and provider notified (inbox)", inbox.some((n) => n.userId === patient.id) && inbox.some((n) => n.userId === doctor.id), `${inbox.length} row(s)`);

    // ── Ledger in the booking detail ──
    const detail = await fetch(`${BASE}/api/admin/bookings/${guarded.id}`, { headers: { cookie: cookieFor(admin) } }).then((r) => r.json());
    check("detail lists the refund in its ledger", Array.isArray(detail.ledger) && detail.ledger.length === 1 && detail.ledger[0].type === "CANCELLATION_REFUND" && detail.ledger[0].admin?.name === admin.name,
      `${detail.ledger?.length} row(s)`);
    check("detail names the acting admin", detail.adminActionByName === admin.name && detail.adminActionReason === REASON, `${detail.adminActionByName}`);
    const detailDenied = await fetch(`${BASE}/api/admin/bookings/${guarded.id}`, { headers: { cookie: cookieFor(patient) } });
    check("detail is admin-only", detailDenied.status === 403, `${detailDenied.status}`);

    // ── Double click: concurrent cancels refund once ──
    const raced = await mk();
    const b0 = await balance();
    const statuses = await Promise.all(Array.from({ length: PARALLEL }, () => act(raced.id, { action: "CANCEL", reason: REASON }).then((r) => r.status)));
    const racedRows = await refunds(raced.id);
    check("concurrent cancels: one wins, rest 409", statuses.filter((s) => s === 200).length === 1 && statuses.every((s) => s === 200 || s === 409), tally(statuses));
    check("concurrent cancels: one refund", racedRows.length === 1 && (await balance()) - b0 === FEE, `${racedRows.length} row(s), +₹${(await balance()) - b0}`);

    // ── Finished bookings are rejected ──
    const completed = await mk({ status: "COMPLETED", completedAt: new Date() });
    for (const action of ["CANCEL", "REASSIGN", "NO_SHOW"]) {
      const r = await act(completed.id, { action, reason: REASON });
      const row = await prisma.appointment.findUniqueOrThrow({ where: { id: completed.id } });
      check(`completed booking: ${action} rejected`, r.status === 409 && row.status === "COMPLETED" && (await refunds(completed.id)).length === 0, `${r.status}`);
    }

    // ── Unpaid cancel: nothing to refund ──
    const unpaid = await mk({ paymentStatus: "PENDING", status: "PENDING_APPROVAL" });
    const u = await act(unpaid.id, { action: "CANCEL", reason: REASON });
    check("unpaid pending cancel → no refund row", u.status === 200 && u.json.refund === 0 && (await refunds(unpaid.id)).length === 0, `${u.status} refund=${u.json.refund}`);

    // ── No-show ──
    const future = await mk();
    const early = await act(future.id, { action: "NO_SHOW", reason: REASON });
    check("no-show before its time → 409", early.status === 409 && (await prisma.appointment.findUniqueOrThrow({ where: { id: future.id } })).status === "SCHEDULED", `${early.status}`);
    const pending = await mk({ status: "PENDING_APPROVAL", scheduledAt: new Date(Date.now() - 3600_000) });
    check("no-show on a pending request → 409", (await act(pending.id, { action: "NO_SHOW", reason: REASON })).status === 409, "409");
    const past = await mk({ scheduledAt: new Date(Date.now() - 3600_000) });
    const b1 = await balance();
    const ns = await act(past.id, { action: "NO_SHOW", reason: REASON });
    const nsRow = await prisma.appointment.findUniqueOrThrow({ where: { id: past.id }, omit: ADMIN_AUDIT_INCLUDE });
    check("no-show after its time → 200, no refund", ns.status === 200 && nsRow.status === "NO_SHOW" && (await balance()) === b1 && (await refunds(past.id)).length === 0, `${ns.status} ${nsRow.status}`);
    check("no-show audited", nsRow.adminActionBy === admin.id && nsRow.adminActionReason === REASON, `${nsRow.adminActionBy === admin.id}`);
    check("no-show then cancel → 409", (await act(past.id, { action: "CANCEL", reason: REASON })).status === 409, "409");

    // ── No-show racing the patient's own cancel ──
    let raceOk = true;
    let outcomes = "";
    for (let i = 0; i < 5; i++) {
      const appt = await mk({ scheduledAt: new Date(Date.now() - 600_000) });
      const bal = await balance();
      const [adminStatus, patientStatus] = await Promise.all([act(appt.id, { action: "NO_SHOW", reason: REASON }).then((r) => r.status), patientCancel(appt.id)]);
      const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
      const credited = (await balance()) - bal;
      const nRefunds = (await refunds(appt.id)).length;
      const wins = [adminStatus, patientStatus].filter((s) => s === 200).length;
      const consistent = row.status === "NO_SHOW" ? credited === 0 && nRefunds === 0 && adminStatus === 200
        : row.status === "CANCELLED" ? credited === FEE && nRefunds === 1 && patientStatus === 200
          : false;
      if (wins !== 1 || !consistent) raceOk = false;
      outcomes += `${row.status}(${adminStatus}/${patientStatus}) `;
    }
    check("no-show vs patient cancel: exactly one lands, money matches", raceOk, outcomes.trim());

    // ── Reassign ──
    const nurseBooking = await mk({ doctorId: nurse.id, providerType: "NURSE", consultType: "HOME" });
    check("reassign nurse booking → 400", (await act(nurseBooking.id, { action: "REASSIGN", reason: REASON })).status === 400, "400");
    const walkIn = await mk({ bookedById: doctor.id });
    check("reassign walk-in → 400", (await act(walkIn.id, { action: "REASSIGN", reason: REASON })).status === 400, "400");
    const toMove = await mk();
    const b2 = await balance();
    const re = await act(toMove.id, { action: "REASSIGN", reason: REASON });
    const reRows = await refunds(toMove.id);
    const moved = await prisma.appointment.findUniqueOrThrow({ where: { id: toMove.id } });
    check("reassign with nobody free → cancelled + credited once", re.status === 200 && re.json.reassignedTo === null && moved.status === "CANCELLED"
      && reRows.length === 1 && reRows[0].type === "REASSIGNMENT_CREDIT" && reRows[0].adminId === admin.id && (await balance()) - b2 === FEE,
      `${re.status} ${moved.status} ${reRows.length} row(s)`);
    // ── Audit never leaks to the patient or provider ──
    const leaky = (label: string, json: unknown) => {
      const text = JSON.stringify(json);
      check(`no audit in ${label}`, !/adminAction|adminId/.test(text) && !text.includes(REASON) && !text.includes(admin.id), `${text.length} chars`);
    };
    const audited = await mk({ doctorId: planDoctor.id, scheduledAt: new Date(Date.now() - 3600_000) });
    const shown = await prisma.appointment.findUniqueOrThrow({ where: { id: audited.id } });
    check("audit fields omitted by default", !("adminActionReason" in shown) && !("adminActionBy" in shown), Object.keys(shown).filter((k) => k.startsWith("admin")).join(",") || "none");
    const pNs = await act(audited.id, { action: "NO_SHOW", reason: REASON });
    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: audited.id }, omit: ADMIN_AUDIT_INCLUDE });
    check("audited no-show stored", pNs.status === 200 && stored.adminActionReason === REASON, `${pNs.status}`);
    // A completed visit with an audit stamp too, so the doctor's patient view (care access) loads.
    const done = await mk({ doctorId: planDoctor.id, status: "COMPLETED", completedAt: new Date(), scheduledAt: new Date(Date.now() - 7200_000) });
    await prisma.appointment.update({ where: { id: done.id }, data: { adminActionBy: admin.id, adminActionReason: REASON, adminActionAt: new Date() } });
    const get = async (url: string, who: typeof admin) => {
      const r = await fetch(`${BASE}${url}`, { headers: { cookie: cookieFor(who) } });
      return { status: r.status, json: await r.json().catch(() => null) };
    };
    for (const [label, url, who] of [
      ["patient GET /api/appointments/[id]", `/api/appointments/${audited.id}`, patient],
      ["patient /api/appointments/me", "/api/appointments/me?view=history", patient],
      ["doctor GET /api/appointments/[id]", `/api/appointments/${audited.id}`, planDoctor],
      ["doctor /api/appointments/me", "/api/appointments/me?view=history", planDoctor],
      ["doctor /api/doctors/patients/[id]", `/api/doctors/patients/${patient.id}`, planDoctor],
      ["patient /api/wallet/me", "/api/wallet/me?take=50", patient],
    ] as const) {
      const r = await get(url, who);
      const hasRows = JSON.stringify(r.json).includes(url.includes("wallet") ? "CANCELLATION_REFUND" : audited.id);
      check(`${label} loads with the audited booking`, r.status === 200 && hasRows, `${r.status}`);
      leaky(label, r.json);
    }

    check("reassign again → 409", (await act(toMove.id, { action: "REASSIGN", reason: REASON })).status === 409, "409");
  } finally {
    await prisma.appointment.deleteMany({ where: { patientId: patient.id } });
    await prisma.wallet.deleteMany({ where: { userId: patient.id } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
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
