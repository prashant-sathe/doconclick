// /api/appointments/me views (BUG-TRACKER #55): ?view=active is bounded to
// live bookings + the recent window (what the shared 5s poll fetches),
// ?view=history pages finished bookings newest-first with a stable cursor and
// whole-history counts, bad paging input is a 400, and the bare call still
// returns everything (earnings pages). A doctor's history page still carries
// vitals for a patient they currently have care access to (judged on all
// visits, not just the page). Against a live dev server and the DB in .env,
// throwaway users only.
//
//   npm run test:appointments-feed
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 24 * 60 * 60 * 1000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type Row = { id: string; status: string; scheduledAt: string; latestVitals?: unknown };
type Page = { items: Row[]; nextCursor: string | null; counts: Record<string, number>; error?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function get<T>(as: U, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookieFor(as) } });
  return { status: res.status, json: (await res.json().catch(() => null)) as T };
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `8${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const doctor = await mk({ name: "Feed Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY) } } });
  const nurse = await mk({ name: "Feed Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });
  const patient = await mk({ name: "Feed Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const other = await mk({ name: "Feed Other", role: "PATIENT", patientProfile: { create: { age: 40, gender: "Female" } } });

  const settings = await prisma.platformSettings.findFirst({ select: { chatFollowUpDays: true } });
  const recentDays = Math.max(7, settings?.chatFollowUpDays ?? 7);
  const ago = (days: number) => new Date(Date.now() - days * DAY);
  const mkAppt = (over: Record<string, unknown>) => prisma.appointment.create({ data: {
    doctorId: doctor.id, patientId: patient.id, symptoms: "fever", consultType: "VIDEO", amount: 300, platformFee: 30, paymentMethod: "CASH", ...over,
  } as never });

  try {
    // Live: a pending request and an accepted visit, plus a pending one from long ago (still live).
    const pending = await mkAppt({ status: "PENDING_APPROVAL", scheduledAt: new Date(Date.now() + 2 * DAY) });
    const scheduled = await mkAppt({ status: "SCHEDULED", scheduledAt: new Date(Date.now() + 3 * DAY) });
    const recentDone = await mkAppt({ status: "COMPLETED", scheduledAt: ago(2), completedAt: ago(2) });
    // Old history: 25 completed and 1 cancelled, well outside the recent window.
    const old: string[] = [];
    for (let i = 0; i < 25; i++) old.push((await mkAppt({ status: "COMPLETED", scheduledAt: ago(recentDays + 10 + i), completedAt: ago(recentDays + 10 + i) })).id);
    const oldCancelled = await mkAppt({ status: "CANCELLED", scheduledAt: ago(recentDays + 50) });
    const finishedIds = [recentDone.id, ...old, oldCancelled.id];

    // ── Input ──
    for (const q of ["view=everything", "view=history&limit=0", "view=history&limit=51", "view=history&limit=abc", "view=history&status=SCHEDULED", "view=history&status=", "view=history&cursor=nope"]) {
      const r = await get<{ error?: string }>(patient, `/api/appointments/me?${q}`);
      check(`?${q} → 400 with a message`, r.status === 400 && typeof r.json?.error === "string", `${r.status} ${r.json?.error}`);
    }
    const foreign = await get<{ error?: string }>(other, `/api/appointments/me?view=history&cursor=${old[0]}`);
    check("someone else's appointment as the cursor → 400", foreign.status === 400, `${foreign.status}`);

    // ── Active ──
    const active = await get<Row[]>(patient, "/api/appointments/me?view=active");
    const activeIds = new Set(active.json.map((a) => a.id));
    check("active: live + recent only (3 of 29)", active.status === 200 && active.json.length === 3 && [pending.id, scheduled.id, recentDone.id].every((id) => activeIds.has(id)), `${active.json.length}: ${[...activeIds].length}`);
    check("…nothing from the old history", !old.some((id) => activeIds.has(id)) && !activeIds.has(oldCancelled.id), "ok");

    // ── History pages ──
    const p1 = await get<Page>(patient, "/api/appointments/me?view=history");
    check("history page 1: 20 items + a cursor", p1.status === 200 && p1.json.items.length === 20 && typeof p1.json.nextCursor === "string", `${p1.json.items?.length} ${p1.json.nextCursor}`);
    check("…finished only, newest first", p1.json.items.every((a) => a.status !== "PENDING_APPROVAL" && a.status !== "SCHEDULED") && p1.json.items.every((a, i, xs) => i === 0 || new Date(xs[i - 1].scheduledAt) >= new Date(a.scheduledAt)) && p1.json.items[0].id === recentDone.id, "ok");
    check("…whole-history counts", p1.json.counts.COMPLETED === 26 && p1.json.counts.CANCELLED === 1 && p1.json.counts.NO_SHOW === 0, JSON.stringify(p1.json.counts));
    const p2 = await get<Page>(patient, `/api/appointments/me?view=history&cursor=${p1.json.nextCursor}`);
    check("page 2: the remaining 7, no cursor", p2.status === 200 && p2.json.items.length === 7 && p2.json.nextCursor === null, `${p2.json.items?.length} ${p2.json.nextCursor}`);
    const seen = [...p1.json.items, ...p2.json.items].map((a) => a.id);
    check("…the pages cover every finished booking exactly once", seen.length === finishedIds.length && new Set(seen).size === seen.length && finishedIds.every((id) => seen.includes(id)), `${seen.length}/${finishedIds.length}`);
    const small = await get<Page>(patient, "/api/appointments/me?view=history&limit=5");
    check("limit=5 → 5 items", small.json.items.length === 5 && !!small.json.nextCursor, `${small.json.items.length}`);
    const onlyCancelled = await get<Page>(patient, "/api/appointments/me?view=history&status=CANCELLED");
    check("status=CANCELLED → just that one", onlyCancelled.json.items.length === 1 && onlyCancelled.json.items[0].id === oldCancelled.id, `${onlyCancelled.json.items.length}`);

    // ── Same-time tiebreak: a stable cursor ──
    const tie = ago(recentDays + 100);
    for (let i = 0; i < 4; i++) await mkAppt({ patientId: other.id, status: "COMPLETED", scheduledAt: tie });
    const t1 = await get<Page>(other, "/api/appointments/me?view=history&limit=2");
    const t2 = await get<Page>(other, `/api/appointments/me?view=history&limit=2&cursor=${t1.json.nextCursor}`);
    const tieIds = [...t1.json.items, ...t2.json.items].map((a) => a.id);
    check("four visits at the same time page cleanly (no repeats, none lost)", new Set(tieIds).size === 4 && t2.json.nextCursor === null, `${tieIds.length} unique ${new Set(tieIds).size}`);

    // ── Bare call: everything, as before ──
    const all = await get<Row[]>(patient, "/api/appointments/me");
    check("no view → the full array (earnings pages)", Array.isArray(all.json) && all.json.length === 29, `${all.json.length}`);

    // ── Doctor: care access over all visits, not just the page ──
    await prisma.vitalReading.create({ data: { patientId: patient.id, recordedById: nurse.id, recordedAt: ago(1), systolic: 120, diastolic: 80 } as never });
    const docActive = await get<Row[]>(doctor, "/api/appointments/me?view=active");
    check("doctor active: live + recent only", docActive.status === 200 && docActive.json.filter((a) => [pending.id, scheduled.id, recentDone.id].includes(a.id)).length === 3 && !docActive.json.some((a) => old.includes(a.id)), `${docActive.json.length}`);
    const docHist = await get<Page>(doctor, "/api/appointments/me?view=history&status=CANCELLED");
    const c = docHist.json.items.find((a) => a.id === oldCancelled.id);
    check("doctor history: an old row of a patient with a live visit still has their vitals", !!c && c.latestVitals !== null, `${c ? JSON.stringify(c.latestVitals).slice(0, 50) : "missing"}`);
    const otherRow = (await get<Page>(doctor, "/api/appointments/me?view=history&limit=50")).json.items.find((a) => tieIds.includes(a.id));
    check("…but not for a patient with only long-past visits", !!otherRow && otherRow.latestVitals === null, `${otherRow ? String(otherRow.latestVitals) : "missing"}`);

    // ── Nurse ──
    const nb = await mkAppt({ doctorId: nurse.id, providerType: "NURSE", consultType: "HOME", status: "PENDING_APPROVAL", scheduledAt: new Date(Date.now() + DAY) });
    await mkAppt({ doctorId: nurse.id, providerType: "NURSE", consultType: "HOME", status: "COMPLETED", scheduledAt: ago(recentDays + 30) });
    const na = await get<Row[]>(nurse, "/api/appointments/me?view=active");
    const nh = await get<Page>(nurse, "/api/appointments/me?view=history");
    check("nurse: active has the request, history the old visit", na.json.length === 1 && na.json[0].id === nb.id && nh.json.items.length === 1 && nh.json.counts.COMPLETED === 1, `${na.json.length} / ${nh.json.items.length}`);
  } finally {
    await prisma.vitalReading.deleteMany({ where: { patientId: { in: ids } } });
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
