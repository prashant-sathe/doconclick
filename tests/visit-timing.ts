// Nurse visit/shift timing (BUG-TRACKER #26): a visit can only be started
// from 30 min before its booked time to 4 h after (code and skip-reason paths
// alike), and a SHIFT can only be completed once visitStartedAt + duration −
// 15 min has passed. Pure checks on src/lib/nursePackage.ts, then API checks
// against a live dev server and the DB in .env, using only throwaway QA
// users/services/bookings that are removed afterwards.
//
//   npm run test:visit-timing
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { visitStartProblem, shiftCompleteProblem, VISIT_START_EARLY_MS, VISIT_START_LATE_MS, SHIFT_END_TOLERANCE_MS } from "../src/lib/nursePackage";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  // ── Pure rules ──
  const at = new Date("2026-10-20T04:30:00Z");
  const off = (ms: number) => new Date(at.getTime() + ms);
  check("start: 2 h early refused", !!visitStartProblem(at, off(-2 * HOUR)), "refused");
  check("start: 31 min early refused", !!visitStartProblem(at, off(-VISIT_START_EARLY_MS - MIN)), "refused");
  check("start: 30 min early allowed", visitStartProblem(at, off(-VISIT_START_EARLY_MS)) === null, "allowed");
  check("start: on time allowed", visitStartProblem(at, at) === null, "allowed");
  check("start: 4 h late allowed", visitStartProblem(at, off(VISIT_START_LATE_MS)) === null, "allowed");
  check("start: next day refused", !!visitStartProblem(at, off(DAY)), "refused");
  const twelve = 12 * 60;
  check("shift: 30 s in refused", !!shiftCompleteProblem(at, twelve, off(30_000)), "refused");
  check("shift: 11 h 44 m refused", !!shiftCompleteProblem(at, twelve, off(12 * HOUR - SHIFT_END_TOLERANCE_MS - MIN)), "refused");
  check("shift: 11 h 45 m allowed", shiftCompleteProblem(at, twelve, off(12 * HOUR - SHIFT_END_TOLERANCE_MS)) === null, "allowed");

  // ── API, throwaway QA data ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (role: string, extra: Record<string, unknown> = {}) => {
    const u = await prisma.user.create({ data: { name: `QA Timing ${role} ${++n}`, mobile: `4${stamp}${String(n).padStart(2, "0")}`, role, ...extra } as never });
    ids.push(u.id);
    return u;
  };
  const cookieFor = (u: { id: string; name: string; role: string; mobile: string }) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
  const call = async (as: { id: string; name: string; role: string; mobile: string }, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookieFor(as), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  const patient = await mk("PATIENT", { patientProfile: { create: { age: 30, gender: "Female" } } });
  const nurse = await mk("NURSE", {
    nurseProfile: {
      create: {
        status: "APPROVED", lat: 18.52, lng: 73.85, radius: 10, availability: "",
        registrationFeePaid: true, subscriptionPaidUntil: new Date(Date.now() + 30 * DAY),
      },
    },
  });
  const visitSvc = await prisma.nurseService.create({ data: { name: `QA Timing Visit ${stamp}`, durationMinutes: 30 } });
  const shiftSvc = await prisma.nurseService.create({ data: { name: `QA Timing Shift ${stamp}`, durationMinutes: 12 * 60, kind: "SHIFT" } });

  // An accepted, paid, arrived-at booking — just short of being started.
  const booking = (service: { id: string; name: string }, scheduledAt: Date, extra: Record<string, unknown> = {}) =>
    prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: nurse.id, providerType: "NURSE", consultType: "HOME",
        symptoms: "QA timing test", nurseServiceId: service.id, serviceName: service.name,
        status: "SCHEDULED", paymentStatus: "PAID", travelStatus: "ARRIVED", visitOtp: "4821",
        amount: 500, scheduledAt, ...extra,
      } as never,
    });
  const start = (id: string, body: unknown) => call(nurse, "POST", `/api/appointments/${id}/start-visit`, body);
  const complete = (id: string) => call(nurse, "PATCH", `/api/appointments/${id}`, { status: "COMPLETED" });

  try {
    const early = await booking(visitSvc, new Date(Date.now() + 3 * HOUR));
    let r = await start(early.id, { code: "4821" });
    check("API: visit 3 h ahead, correct code refused", r.status === 400 && r.json.code === "OUTSIDE_START_WINDOW", `${r.status} ${r.json.error}`);
    r = await start(early.id, { skipReason: "Patient phone is switched off today" });
    check("API: visit 3 h ahead, skip-reason refused too", r.status === 400 && r.json.code === "OUTSIDE_START_WINDOW", `${r.status} ${r.json.error}`);
    const e = await prisma.appointment.findUniqueOrThrow({ where: { id: early.id } });
    check("API: early visit not started, no attempt burned", !e.visitStartedAt && e.visitOtpAttempts === 0, `started=${!!e.visitStartedAt} attempts=${e.visitOtpAttempts}`);

    const stale = await booking(visitSvc, new Date(Date.now() - DAY));
    r = await start(stale.id, { code: "4821" });
    check("API: yesterday's visit refused", r.status === 400 && r.json.code === "OUTSIDE_START_WINDOW", `${r.status} ${r.json.error}`);

    const soon = await booking(visitSvc, new Date(Date.now() + 20 * MIN));
    r = await start(soon.id, { code: "4821" });
    check("API: visit 20 min ahead starts", r.status === 200 && !!r.json.visitStartedAt, `${r.status}`);
    r = await complete(soon.id);
    check("API: started VISIT completes right away", r.status === 200 && r.json.status === "COMPLETED", `${r.status} ${r.json.error ?? r.json.status}`);

    const shift = await booking(shiftSvc, new Date(Date.now() + 10 * MIN));
    r = await start(shift.id, { code: "4821" });
    check("API: shift starts in window", r.status === 200, `${r.status}`);
    r = await complete(shift.id);
    check("API: 12 h shift complete seconds in refused", r.status === 400 && r.json.code === "SHIFT_NOT_OVER", `${r.status} ${r.json.error}`);
    const s = await prisma.appointment.findUniqueOrThrow({ where: { id: shift.id } });
    check("API: refused shift still SCHEDULED", s.status === "SCHEDULED", s.status);

    // Same shift, but as if it had started 11 h 50 m ago.
    await prisma.appointment.update({ where: { id: shift.id }, data: { visitStartedAt: new Date(Date.now() - (12 * HOUR - 10 * MIN)) } });
    r = await complete(shift.id);
    check("API: shift completes within the 15-min handover allowance", r.status === 200 && r.json.status === "COMPLETED", `${r.status} ${r.json.error ?? r.json.status}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.nurseService.deleteMany({ where: { id: { in: [visitSvc.id, shiftSvc.id] } } });
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
