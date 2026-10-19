// Shared isDoctorBookable() rule (BUG-TRACKER #15): a doctor hidden from the
// listing (unverified, lapsed trial/plan, not APPROVED, deleted) can't be
// booked, rescheduled to, followed up with, or saved via the API either.
// Runs against a live dev server (npm run dev) and the DB in .env, using only
// throwaway users that are removed afterwards.
//
//   npm run test:doctor-bookable        (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const future = new Date(Date.now() + 30 * DAY);
  const past = new Date(Date.now() - DAY);
  const base = { status: "APPROVED", isVerified: true, offersVideo: true, videoFee: 300, trialEndsAt: future };

  const variants: Record<string, Record<string, unknown>> = {
    bookable: {},
    paidPlan: { trialEndsAt: past, subscriptionPaidUntil: future },
    unverified: { isVerified: false },
    trialExpired: { trialEndsAt: past, subscriptionPaidUntil: null },
    pending: { status: "PENDING" },
  };
  const ids: string[] = [];
  const doctors: Record<string, { id: string }> = {};
  let i = 0;
  for (const [key, over] of Object.entries(variants)) {
    const d = await prisma.user.create({
      data: { name: `Bookable Test ${key}`, mobile: `9${i++}${stamp}`, role: "DOCTOR", doctorProfile: { create: { ...base, ...over } as never } },
    });
    ids.push(d.id);
    doctors[key] = d;
  }
  const deleted = await prisma.user.create({
    data: { name: "Bookable Test deleted", mobile: `9${i++}${stamp}`, role: "DOCTOR", deletedAt: new Date(), doctorProfile: { create: base as never } },
  });
  ids.push(deleted.id);
  doctors.deleted = deleted;

  const patient = await prisma.user.create({
    data: { name: "Bookable Test Patient", mobile: `6${stamp}0`, role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 30, gender: "Male" } } },
  });
  ids.push(patient.id);
  const cookie = `doconclick_token=${jwt.sign({ id: patient.id, name: patient.name, role: "PATIENT", mobile: patient.mobile, tv: 0 }, SECRET)}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const expectOk = (key: string) => key === "bookable" || key === "paidPlan";

  try {
    // ── Listing + public profile (the reference rule) ──
    const listed = new Set(((await call("GET", "/api/doctors")).json as { id: string }[]).map((d) => d.id));
    for (const [key, d] of Object.entries(doctors)) {
      check(`listing: ${key}`, listed.has(d.id) === expectOk(key), listed.has(d.id) ? "listed" : "hidden");
      const r = await call("GET", `/api/doctors/${d.id}`);
      check(`profile: ${key}`, (r.status === 200) === expectOk(key), `${r.status}`);
    }

    // ── New booking ──
    for (const [key, d] of Object.entries(doctors)) {
      const r = await call("POST", "/api/appointments", { doctorId: d.id, symptoms: "test", consultType: "VIDEO", consentGiven: true });
      check(`book: ${key}`, expectOk(key) ? r.status === 200 : r.status === 404, `${r.status} ${r.json.error ?? ""}`);
    }

    // ── Follow-up of a completed visit ──
    for (const key of ["bookable", "trialExpired", "unverified"]) {
      const orig = await prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctors[key].id, symptoms: "t", consultType: "VIDEO", status: "COMPLETED" },
      });
      const r = await call("POST", "/api/appointments", {
        doctorId: doctors[key].id, symptoms: "follow-up", consultType: "VIDEO", consentGiven: true, followUpOfId: orig.id,
      });
      check(`follow-up: ${key}`, expectOk(key) ? r.status === 200 : r.status === 404, `${r.status} ${r.json.error ?? ""}`);
    }

    // ── /api/appointments/me flags follow-up availability without leaking plan dates ──
    const mine = (await call("GET", "/api/appointments/me")).json as {
      doctorId: string; status: string; doctorBookable: boolean; doctor: { doctorProfile: Record<string, unknown> | null };
    }[];
    const done = mine.filter((a) => a.status === "COMPLETED");
    check("appointments/me: doctorBookable",
      done.length === 3 && done.every((a) => a.doctorBookable === (a.doctorId === doctors.bookable.id)),
      done.map((a) => a.doctorBookable).join(","));
    const leaked = mine.some((a) => a.doctor.doctorProfile && ("trialEndsAt" in a.doctor.doctorProfile || "isVerified" in a.doctor.doctorProfile));
    check("appointments/me: no plan fields leaked", !leaked, leaked ? "LEAKED" : "clean");

    // ── Reschedule ──
    const when = new Date(Date.now() + 2 * DAY);
    when.setUTCHours(6, 0, 0, 0);
    for (const key of ["bookable", "trialExpired"]) {
      const appt = await prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctors[key].id, symptoms: "t", consultType: "VIDEO", status: "PENDING_APPROVAL", scheduledAt: new Date(Date.now() + DAY) },
      });
      const r = await call("PATCH", `/api/appointments/${appt.id}`, { scheduledAt: when.toISOString() });
      check(`reschedule: ${key}`, expectOk(key) ? r.status === 200 : r.status === 409, `${r.status} ${r.json.error ?? ""}`);
      if (key === "trialExpired") {
        const c = await call("PATCH", `/api/appointments/${appt.id}`, { status: "CANCELLED" });
        check("cancel still allowed with unbookable doctor", c.status === 200, `${c.status} ${c.json.error ?? ""}`);
      }
    }

    // ── Saved doctors ──
    for (const [key, d] of Object.entries(doctors)) {
      const r = await call("POST", "/api/patients/me/saved-doctors", { doctorId: d.id });
      check(`save: ${key}`, expectOk(key) ? r.status === 200 : r.status === 404, `${r.status} ${r.json.error ?? ""}`);
    }
    // A doctor saved while bookable whose trial later lapsed.
    await prisma.savedDoctor.create({ data: { patientId: patient.id, doctorId: doctors.trialExpired.id } });
    const saved = (await call("GET", "/api/patients/me/saved-doctors")).json.saved as { bookable: boolean; doctor: { id: string } }[];
    const flags = Object.fromEntries(saved.map((s) => [s.doctor.id, s.bookable]));
    check("saved list: bookable flags",
      flags[doctors.bookable.id] === true && flags[doctors.paidPlan.id] === true && flags[doctors.trialExpired.id] === false,
      JSON.stringify(Object.values(flags)));
  } finally {
    await prisma.savedDoctor.deleteMany({ where: { patientId: patient.id } });
    await prisma.appointment.deleteMany({ where: { patientId: patient.id } });
    await prisma.doctorProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: ids } } });
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
