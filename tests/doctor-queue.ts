// Doctor queue order (BUG-TRACKER #24): /api/appointments/me returns the
// doctor's appointments soonest-first by visit time, "Next" skips visits
// that are already over, and those past SCHEDULED visits are what the
// dashboard asks the doctor to close (src/lib/doctorQueue.ts). Plus the
// dashboard filters (F12): today / tomorrow / next 7 days in IST, type,
// clinic, status; search by name or mobile; tel: / WhatsApp links; the API
// sends each visit's clinic for the clinic filter. The API part
// runs against a live dev server and the DB in .env, throwaway users only.
//
//   npm run test:doctor-queue
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import {
  isOverdue, nextUpcoming, byVisitAsc, byVisitDesc, OVERDUE_GRACE_MS,
  inRange, matchesQueueFilters, matchesPatientSearch, contactLinks, hasActiveFilters, DEFAULT_QUEUE_FILTERS,
} from "../src/lib/doctorQueue";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const HOUR = 3600_000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  // ── Queue rules ──
  const now = Date.UTC(2026, 9, 18, 10, 0);
  const at = (h: number) => new Date(now + h * HOUR).toISOString();
  const lastWeek = { id: "lastWeek", status: "SCHEDULED", scheduledAt: at(-24 * 7) };
  const justStarted = { id: "justStarted", status: "SCHEDULED", scheduledAt: at(-0.25) };
  const graceEdge = { id: "graceEdge", status: "SCHEDULED", scheduledAt: new Date(now - OVERDUE_GRACE_MS).toISOString() };
  const later = { id: "later", status: "SCHEDULED", scheduledAt: at(3) };
  const pendingOld = { id: "pendingOld", status: "PENDING_APPROVAL", scheduledAt: at(-48) };

  check("a week-old scheduled visit is overdue", isOverdue(lastWeek, now), "overdue");
  check("a visit 15 min in (running late) is not", !isOverdue(justStarted, now), "not overdue");
  check("exactly at the grace boundary is not yet", !isOverdue(graceEdge, now), "not overdue");
  check("only SCHEDULED visits count", !isOverdue(pendingOld, now), "pending ignored");
  check("Next skips the stale visit", nextUpcoming([later, lastWeek, justStarted], now)?.id === "justStarted",
    `${nextUpcoming([later, lastWeek, justStarted], now)?.id}`);
  check("Next is nothing when only stale visits remain", nextUpcoming([lastWeek], now) === undefined, "undefined");
  check("asc / desc ordering", [later, lastWeek, justStarted].sort(byVisitAsc).map((a) => a.id).join() === "lastWeek,justStarted,later"
    && [later, lastWeek, justStarted].sort(byVisitDesc)[0].id === "later", "ok");

  // ── Filters (F12) ──
  // 23:30 IST on 18 Oct — tomorrow starts in 30 minutes.
  const lateNight = Date.parse("2026-10-18T23:30:00+05:30");
  const ist = (s: string) => new Date(`${s}+05:30`).toISOString();
  check("today = same IST day", inRange(ist("2026-10-18T09:00:00"), "TODAY", lateNight) && !inRange(ist("2026-10-19T00:10:00"), "TODAY", lateNight), "ok");
  check("tomorrow = next IST day, even 40 min away", inRange(ist("2026-10-19T00:10:00"), "TOMORROW", lateNight) && !inRange(ist("2026-10-20T10:00:00"), "TOMORROW", lateNight), "ok");
  check("next 7 days = today … +6, not +7 or yesterday",
    inRange(ist("2026-10-18T08:00:00"), "WEEK", lateNight) && inRange(ist("2026-10-24T22:00:00"), "WEEK", lateNight)
    && !inRange(ist("2026-10-25T09:00:00"), "WEEK", lateNight) && !inRange(ist("2026-10-17T22:00:00"), "WEEK", lateNight), "ok");
  check("ALL ignores the date", inRange(ist("2020-01-01T00:00:00"), "ALL", lateNight), "ok");
  const clinicVisit = { status: "SCHEDULED", scheduledAt: ist("2026-10-19T10:00:00"), consultType: "CLINIC", clinicId: "c1" };
  const f = (o: Partial<typeof DEFAULT_QUEUE_FILTERS>) => ({ ...DEFAULT_QUEUE_FILTERS, ...o });
  check("filters combine (range + type + clinic + status)",
    matchesQueueFilters(clinicVisit, f({ range: "TOMORROW", type: "CLINIC", clinicId: "c1", status: "SCHEDULED" }), lateNight)
    && !matchesQueueFilters(clinicVisit, f({ type: "VIDEO" }), lateNight)
    && !matchesQueueFilters(clinicVisit, f({ clinicId: "c2" }), lateNight)
    && !matchesQueueFilters(clinicVisit, f({ status: "PENDING_APPROVAL" }), lateNight)
    && !matchesQueueFilters({ ...clinicVisit, clinicId: null }, f({ clinicId: "c1" }), lateNight), "ok");
  check("default filters are inactive, any change is active", !hasActiveFilters(DEFAULT_QUEUE_FILTERS) && hasActiveFilters(f({ range: "WEEK" })), "ok");

  const appt = { patientName: "Asha Patil", patient: { name: "Ramesh Patil", mobile: "9876543210" } };
  const searches: [string, boolean][] = [
    ["asha", true], ["ramesh", true], ["", true], ["9876543210", true], ["+91 98765 43210", true], ["43210", true],
    ["098765", true], ["98", false], ["11111", false], ["asha 987", false], ["sunita", false],
  ];
  for (const [q, want] of searches) check(`search "${q}" → ${want}`, matchesPatientSearch(appt, q) === want, String(matchesPatientSearch(appt, q)));
  const links = contactLinks("9876543210");
  check("contact links for a real mobile", links?.tel === "tel:+919876543210" && links.whatsapp === "https://wa.me/919876543210", JSON.stringify(links));
  check("no links for a placeholder / short number", contactLinks("1234567890") === null && contactLinks("98765") === null && contactLinks("") === null, "null");

  // ── API order ──
  const stamp = String(Date.now()).slice(-8);
  const doctor = await prisma.user.create({ data: { name: "Queue Doctor", mobile: `1${stamp}5`, role: "DOCTOR", doctorProfile: { create: { status: "APPROVED" } } } });
  const patient = await prisma.user.create({ data: { name: "Queue Patient", mobile: `1${stamp}6`, role: "PATIENT" } });
  try {
    // Booked in the opposite order to their visit times.
    const offsets = [72, 5, -30, 24, 1];
    for (const h of offsets) {
      await prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctor.id, symptoms: `+${h}h`, consultType: "VIDEO", status: "SCHEDULED", scheduledAt: new Date(Date.now() + h * HOUR) },
      });
    }
    const cookie = `doconclick_token=${jwt.sign({ id: doctor.id, name: doctor.name, role: "DOCTOR", mobile: doctor.mobile, tv: 0 }, SECRET)}`;
    const clinic = await prisma.clinic.create({ data: { doctorId: doctor.id, name: "Queue Clinic", address: "Pune", lat: 18.5, lng: 73.8 } as never });
    await prisma.appointment.create({
      data: { patientId: patient.id, doctorId: doctor.id, clinicId: clinic.id, symptoms: "+48h", consultType: "CLINIC", status: "SCHEDULED", scheduledAt: new Date(Date.now() + 48 * HOUR) },
    });
    const list = (await (await fetch(`${BASE}/api/appointments/me`, { headers: { Cookie: cookie } })).json()) as { symptoms: string; scheduledAt: string; clinicId: string | null; clinic: { name: string } | null; patient: { mobile: string } }[];
    const order = list.map((a) => a.symptoms).join(",");
    check("API returns the doctor's appointments by visit time, soonest first", order === "+-30h,+1h,+5h,+24h,+48h,+72h", order);
    const atClinic = list.find((a) => a.symptoms === "+48h");
    check("…with each visit's clinic (for the clinic filter) and the patient's mobile", atClinic?.clinicId === clinic.id && atClinic.clinic?.name === "Queue Clinic" && list[0].clinic === null && list[0].patient.mobile === patient.mobile,
      `${atClinic?.clinic?.name} / ${list[0].patient.mobile}`);
    const active = (await (await fetch(`${BASE}/api/appointments/me?view=active`, { headers: { Cookie: cookie } })).json()) as { symptoms: string }[];
    check("the dashboard's live feed holds next week's visits (tomorrow/week views filter it)", active.some((a) => a.symptoms === "+72h"), `${active.length} rows`);

    // ── Server-side history search (P2-29): >20 finished visits, find the oldest ──
    const old = await prisma.user.create({ data: { name: "Zubin Oldtimer", mobile: `1${stamp}7`, role: "PATIENT" } });
    try {
      await prisma.appointment.create({
        data: { patientId: old.id, doctorId: doctor.id, symptoms: "oldest", consultType: "VIDEO", status: "COMPLETED", scheduledAt: new Date(Date.now() - 900 * 24 * HOUR) },
      });
      for (let i = 0; i < 25; i++) {
        await prisma.appointment.create({
          data: { patientId: patient.id, doctorId: doctor.id, symptoms: `h${i}`, consultType: i % 2 ? "CLINIC" : "VIDEO", clinicId: i % 2 ? clinic.id : null, status: i % 5 === 0 ? "CANCELLED" : "COMPLETED", scheduledAt: new Date(Date.now() - (i + 2) * 24 * HOUR) },
        });
      }
      const hist = async (qs: string) => (await fetch(`${BASE}/api/appointments/me?view=history&${qs}`, { headers: { Cookie: cookie } })).json() as Promise<{ items: { symptoms: string }[]; nextCursor: string | null; error?: string }>;
      const firstPage = await hist("limit=20");
      check("history page 1 doesn't hold the oldest visit", firstPage.items.length === 20 && !firstPage.items.some((a) => a.symptoms === "oldest") && !!firstPage.nextCursor, `${firstPage.items.length} rows`);
      const byMobile = await hist(`q=${encodeURIComponent(`+91 ${old.mobile}`)}`);
      check("searching the oldest patient's mobile finds it", byMobile.items.length === 1 && byMobile.items[0].symptoms === "oldest", `${byMobile.items.length}`);
      const byName = await hist("q=zubin");
      check("name search is case-insensitive", byName.items.length === 1, `${byName.items.length}`);
      const shortDigits = await hist("q=12");
      check("fewer than 3 digits don't search the mobile", shortDigits.items.length === 0, `${shortDigits.items.length}`);
      const cancelledOnly = await hist("status=CANCELLED&limit=50");
      check("status filter on the server", cancelledOnly.items.length === 5, `${cancelledOnly.items.length}`);
      const clinicOnly = await hist(`consultType=CLINIC&clinicId=${clinic.id}&limit=50`);
      check("type + clinic filters on the server", clinicOnly.items.length === 12, `${clinicOnly.items.length}`);
      const day = new Date(Date.now() - 900 * 24 * HOUR).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const byDate = await hist(`from=${day}&to=${day}`);
      check("from / to are IST days", byDate.items.length === 1 && byDate.items[0].symptoms === "oldest", `${byDate.items.length}`);
      const paged = await hist(`q=${patient.mobile}&limit=10`);
      check("a search pages with a cursor", paged.items.length === 10 && !!paged.nextCursor, `${paged.items.length}`);
      const badType = await fetch(`${BASE}/api/appointments/me?view=history&consultType=XX`, { headers: { Cookie: cookie } });
      const badDate = await fetch(`${BASE}/api/appointments/me?view=history&from=2026-02-31`, { headers: { Cookie: cookie } });
      check("bad consultType / date → 400", badType.status === 400 && badDate.status === 400, `${badType.status}/${badDate.status}`);
    } finally {
      await prisma.user.deleteMany({ where: { id: old.id } }).catch(() => {});
    }
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: doctor.id } });
    await prisma.user.deleteMany({ where: { id: { in: [(await prisma.user.findFirst({ where: { mobile: `1${stamp}7` } }))?.id ?? ""] } } });
    await prisma.clinic.deleteMany({ where: { doctorId: doctor.id } });
    await prisma.user.deleteMany({ where: { id: { in: [doctor.id, patient.id] } } });
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
