// Doctor plan enforced server-side (BUG-TRACKER #37): an expired doctor (or
// their staff) can't accept, complete, travel, take leave, add staff, or see
// analytics/settlements — but can still load their profile to renew, cancel
// or decline (so patients are refunded), and revoke staff. Against a live dev
// server and the DB in .env, throwaway users only.
//
//   npm run test:doctor-subscription
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 24 * 60 * 60_000;

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
const expired = (r: { status: number; json: { code?: string } }) => r.status === 403 && r.json.code === "SUBSCRIPTION_EXPIRED";
const show = (r: { status: number; json: { error?: string } }) => `${r.status} ${r.json.error ?? ""}`;

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `5${stamp}${n++}`, ...data } as never });
    ids.push(u.id);
    return u;
  };
  const doctorWith = (name: string, plan: Record<string, unknown>) => mk({
    name, role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, ...plan } },
  });
  const lapsed = await doctorWith("Plan Expired Doctor", { trialEndsAt: new Date(Date.now() - DAY), subscriptionPaidUntil: new Date(Date.now() - 2 * DAY) });
  const paid = await doctorWith("Plan Paid Doctor", { trialEndsAt: new Date(Date.now() - 30 * DAY), subscriptionPaidUntil: new Date(Date.now() + 10 * DAY) });
  const staff = await mk({ name: "Plan Staff", role: "STAFF", staffAccount: { create: { doctorId: lapsed.id, active: true } } });
  const otherStaff = await mk({ name: "Plan Staff 2", role: "STAFF", staffAccount: { create: { doctorId: lapsed.id, active: true } } });
  const patient = await mk({ name: "Plan Patient", role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 30, gender: "Male" } } });
  const clinic = await prisma.clinic.create({ data: { doctorId: lapsed.id, name: "Plan Clinic", address: "1 Rd", lat: 18.5, lng: 73.8 } });
  const leave = await prisma.clinicLeave.create({ data: { clinicId: clinic.id, date: new Date(Date.now() + 20 * DAY).toISOString().slice(0, 10) } });

  const appt = (doctorId: string, status: string, extra: Record<string, unknown> = {}) => prisma.appointment.create({
    data: { doctorId, patientId: patient.id, status, scheduledAt: new Date(Date.now() - 60 * 60_000), symptoms: "fever", amount: 500, consultType: "VIDEO", paymentMethod: "CASH", ...extra } as never,
  });

  try {
    // ── Still open: renew, cancel, decline ──
    let r = await call(lapsed, "GET", "/api/doctors/me");
    check("expired doctor can load their profile (to renew)", r.status === 200, show(r));

    // ── Blocked: the work a plan pays for ──
    const pending = await appt(lapsed.id, "PENDING_APPROVAL");
    r = await call(lapsed, "PATCH", `/api/appointments/${pending.id}`, { status: "SCHEDULED" });
    check("accept → 403 SUBSCRIPTION_EXPIRED", expired(r), show(r));
    r = await call(staff, "PATCH", `/api/appointments/${pending.id}`, { status: "SCHEDULED" });
    check("…their staff can't accept either (staff wording)", expired(r) && (r.json.error ?? "").includes("Your doctor"), show(r));
    r = await call(lapsed, "POST", "/api/appointments/bulk-accept");
    check("bulk-accept → 403", expired(r), show(r));
    r = await call(staff, "POST", "/api/appointments/bulk-accept");
    check("…staff bulk-accept → 403", expired(r), show(r));
    r = await call(lapsed, "PATCH", `/api/appointments/${pending.id}`, { status: "REJECTED" });
    check("declining is still allowed", r.status === 200, show(r));

    // Upcoming, so its reschedule request below is still live (one on an elapsed visit lapses).
    const scheduled = await appt(lapsed.id, "SCHEDULED", { scheduledAt: new Date(Date.now() + DAY) });
    r = await call(lapsed, "PATCH", `/api/appointments/${scheduled.id}`, { status: "COMPLETED" });
    check("complete → 403", expired(r), show(r));
    await prisma.appointment.update({ where: { id: scheduled.id }, data: { requestedScheduledAt: new Date(Date.now() + 2 * DAY) } });
    r = await call(lapsed, "PATCH", `/api/appointments/${scheduled.id}`, { reschedule: "ACCEPT" });
    check("accept a reschedule → 403", expired(r), show(r));
    r = await call(lapsed, "PATCH", `/api/appointments/${scheduled.id}`, { reschedule: "DECLINE" });
    check("decline a reschedule is still allowed", r.status === 200, show(r));
    r = await call(lapsed, "PATCH", `/api/appointments/${scheduled.id}`, { status: "CANCELLED" });
    check("cancelling (patient refunded/reassigned) is still allowed", r.status === 200, show(r));

    const home = await appt(lapsed.id, "SCHEDULED", { consultType: "HOME" });
    r = await call(lapsed, "PATCH", `/api/appointments/${home.id}/travel`, { travelStatus: "ON_THE_WAY", lat: 18.5, lng: 73.8 });
    check("travel → 403", expired(r), show(r));

    for (const [label, method, path] of [
      ["analytics", "GET", "/api/doctor/analytics"],
      ["settlements", "GET", "/api/doctor/settlements"],
      ["payout requests (list)", "GET", "/api/doctor/payout-requests"],
      ["payout requests (ask)", "POST", "/api/doctor/payout-requests"],
    ] as const) {
      r = await call(lapsed, method, path);
      check(`${label} → 403`, expired(r), show(r));
    }

    r = await call(lapsed, "POST", `/api/doctors/me/clinics/${clinic.id}/leaves`, { date: new Date(Date.now() + 25 * DAY).toISOString().slice(0, 10) });
    check("add leave → 403", expired(r), show(r));
    r = await call(lapsed, "DELETE", `/api/doctors/me/clinics/${clinic.id}/leaves/${leave.id}`);
    check("remove leave → 403", expired(r), show(r));
    r = await call(lapsed, "GET", `/api/doctors/me/clinics/${clinic.id}/leaves`);
    check("listing leaves still works", r.status === 200, show(r));

    // ── Staff management ──
    r = await call(lapsed, "POST", "/api/doctor/staff", { name: "New Receptionist", mobile: `9${stamp}9`, password: "secret123" });
    check("add staff → 403", expired(r), show(r));
    r = await call(lapsed, "GET", "/api/doctor/staff");
    check("list staff still works", r.status === 200, show(r));
    r = await call(lapsed, "PATCH", `/api/doctor/staff/${otherStaff.id}`, { active: false });
    check("revoking a receptionist is still allowed", r.status === 200 && r.json.active === false, show(r));
    r = await call(lapsed, "PATCH", `/api/doctor/staff/${otherStaff.id}`, { active: true });
    check("reactivating → 403", expired(r), show(r));
    r = await call(lapsed, "PATCH", `/api/doctor/staff/${staff.id}`, { password: "newsecret1" });
    check("password reset → 403", expired(r), show(r));

    // ── A paid plan works (trial over, paid month current) ──
    const paidPending = await appt(paid.id, "PENDING_APPROVAL");
    r = await call(paid, "PATCH", `/api/appointments/${paidPending.id}`, { status: "SCHEDULED" });
    check("paid doctor accepts → 200", r.status === 200, show(r));
    r = await call(paid, "GET", "/api/doctor/analytics");
    check("paid doctor analytics → 200", r.status === 200, show(r));

    // ── Suspension still wins ──
    await prisma.doctorProfile.update({ where: { userId: lapsed.id }, data: { status: "SUSPENDED" } });
    r = await call(lapsed, "GET", "/api/doctor/analytics");
    check("suspended + expired → the suspended response", r.status === 403 && r.json.suspended === true, show(r));
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { mobile: `9${stamp}9` } });
    await prisma.staffProfile.deleteMany({ where: { doctorId: { in: ids } } });
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
