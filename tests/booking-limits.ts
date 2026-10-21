// Booking limits (BUG-TRACKER #31): booking/reschedule horizon, HOME/VIDEO
// times within the doctor's hours, the open-requests cap per provider, and
// the per-user booking rate limit. Against a live dev server and the DB in
// .env, throwaway users only — the live horizon setting is read, never changed.
//
//   npm run test:booking-limits
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { MAX_OPEN_REQUESTS_PER_PROVIDER } from "../src/lib/bookingLimits";
import { BOOKING_HORIZON_DEFAULT_DAYS } from "../src/lib/bookingHorizon";

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
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string; id?: string };
  return { status: res.status, json };
}

// IST calendar helpers: the first date at least `minDays` ahead that is (or
// isn't) a weekend, and an instant at hh:mm IST on a date.
const istDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const istWeekday = (date: string) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" });
function dateAhead(minDays: number, weekend: boolean, not: string[] = []): string {
  for (let i = minDays; i < minDays + 10; i++) {
    const date = istDate(new Date(Date.now() + i * DAY));
    if (["Sat", "Sun"].includes(istWeekday(date)) === weekend && !not.includes(date)) return date;
  }
  throw new Error("unreachable");
}
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

async function main() {
  const horizon = (await prisma.platformSettings.findFirst({ select: { bookingHorizonDays: true } }))?.bookingHorizonDays ?? BOOKING_HORIZON_DEFAULT_DAYS;
  console.log(`(live booking horizon: ${horizon} days)`);

  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: data as never });
    ids.push(u.id);
    return u;
  };
  const patientData = (n: number) => ({
    name: `Limits Patient ${n}`, mobile: `5${stamp}${n}`, role: "PATIENT", termsAcceptedAt: new Date(),
    patientProfile: { create: { age: 30, gender: "Female" } },
  });
  const doctor = await mk({
    name: "Limits Doctor", mobile: `5${stamp}9`, role: "DOCTOR",
    doctorProfile: {
      create: {
        status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY),
        offersVideo: true, videoFee: 300, availability: "Mon-Fri, 9AM-5PM",
      },
    },
  });
  const clinic = await prisma.clinic.create({
    data: {
      doctorId: doctor.id, name: "Limits Clinic", address: "1 Test Rd", lat: 18.5, lng: 73.8,
      slots: { create: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ dayOfWeek: d, fromTime: "09:00", toTime: "17:00" })) },
    },
  });
  const p1 = await mk(patientData(1));
  const p2 = await mk(patientData(2));
  const p3 = await mk(patientData(3));
  const admin = await mk({ name: "Limits Admin", mobile: `5${stamp}8`, role: "ADMIN" });

  const video = (scheduledAt?: string) => ({ doctorId: doctor.id, symptoms: "fever and cough", consultType: "VIDEO", consentGiven: true, ...(scheduledAt ? { scheduledAt } : {}) });
  const weekday = dateAhead(3, false);
  // A different day from `weekday` — over a weekend, "3 ahead" and "4 ahead" are the same Monday.
  const weekday2 = dateAhead(4, false, [weekday]);
  const weekend = dateAhead(3, true);
  const tooFar = dateAhead(horizon + 2, false);

  try {
    // ── Doctor's hours for a scheduled VIDEO booking ──
    let r = await call(p1, "POST", "/api/appointments", video(at(weekday, "11:00")));
    const apptId = r.json.id ?? "";
    check("VIDEO within hours (weekday 11:00) → booked", r.status === 200 && !!apptId, `${r.status} ${r.json.error ?? ""}`);
    r = await call(p1, "POST", "/api/appointments", video(at(weekend, "11:00")));
    check("VIDEO on the doctor's day off → 400 OUTSIDE_HOURS", r.status === 400 && r.json.code === "OUTSIDE_HOURS", `${r.status} ${r.json.error}`);
    r = await call(p1, "POST", "/api/appointments", video(at(weekday, "20:00")));
    check("VIDEO after hours (20:00) → 400 OUTSIDE_HOURS", r.status === 400 && r.json.code === "OUTSIDE_HOURS", `${r.status} ${r.json.error}`);

    // ── Horizon ──
    r = await call(p1, "POST", "/api/appointments", video(at(tooFar, "11:00")));
    check(`booking past the ${horizon}-day horizon → 400`, r.status === 400 && (r.json.error ?? "").includes(`${horizon} days ahead`), `${r.status} ${r.json.error}`);

    // ── Reschedule gets the same checks ──
    r = await call(p1, "PATCH", `/api/appointments/${apptId}`, { scheduledAt: at(weekend, "11:00") });
    check("reschedule onto a day off → 400 OUTSIDE_HOURS", r.status === 400 && r.json.code === "OUTSIDE_HOURS", `${r.status} ${r.json.error}`);
    r = await call(p1, "PATCH", `/api/appointments/${apptId}`, { scheduledAt: at(tooFar, "11:00") });
    check("reschedule past the horizon → 400", r.status === 400 && (r.json.error ?? "").includes(`${horizon} days ahead`), `${r.status} ${r.json.error}`);
    r = await call(p1, "PATCH", `/api/appointments/${apptId}`, { scheduledAt: at(weekday2, "12:00") });
    check("reschedule within hours and horizon → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // ── Slots API stops at the horizon ──
    const slots = async (date: string) =>
      ((await call(p1, "GET", `/api/doctors/${doctor.id}/slots?clinicId=${clinic.id}&date=${date}`)).json.slots as unknown[] | undefined)?.length ?? -1;
    const near = await slots(weekday2);
    const far = await slots(tooFar);
    check("slots offered inside the horizon", near > 0, `${near} slots`);
    check("no slots past the horizon", far === 0, `${far} slots`);

    // ── Open requests per provider ──
    const hours = ["10:00", "11:00", "12:00", "13:00", "14:00"];
    const booked: string[] = [];
    for (let i = 0; i < MAX_OPEN_REQUESTS_PER_PROVIDER; i++) {
      r = await call(p2, "POST", "/api/appointments", video(at(weekday, hours[i])));
      if (r.status === 200 && r.json.id) booked.push(r.json.id);
    }
    check(`first ${MAX_OPEN_REQUESTS_PER_PROVIDER} pending requests allowed`, booked.length === MAX_OPEN_REQUESTS_PER_PROVIDER, `${booked.length} booked`);
    r = await call(p2, "POST", "/api/appointments", video(at(weekday, hours[MAX_OPEN_REQUESTS_PER_PROVIDER])));
    check("one more → 409 TOO_MANY_REQUESTS", r.status === 409 && r.json.code === "TOO_MANY_REQUESTS", `${r.status} ${r.json.error}`);
    r = await call(p2, "PATCH", `/api/appointments/${booked[0]}`, { status: "CANCELLED" });
    check("patient cancels one request", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(p2, "POST", "/api/appointments", video(at(weekday, hours[MAX_OPEN_REQUESTS_PER_PROVIDER])));
    check("after cancelling, booking is allowed again", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // ── Rate limit, shared by doctor and nurse bookings ──
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await call(p3, "POST", "/api/appointments", {})).status;
    check("10 booking POSTs aren't rate-limited", last === 400, `10th → ${last}`);
    r = await call(p3, "POST", "/api/appointments", {});
    check("11th doctor booking POST → 429", r.status === 429, `${r.status} ${r.json.error}`);
    r = await call(p3, "POST", "/api/nurse-bookings", {});
    check("nurse booking POST shares the limit → 429", r.status === 429, `${r.status} ${r.json.error}`);

    // ── Admin setting (validation only — the live value is left alone) ──
    const g = await call(admin, "GET", "/api/admin/settings");
    check("admin settings expose bookingHorizonDays", g.json.bookingHorizonDays === horizon, `${g.json.bookingHorizonDays}`);
    for (const bad of [3, 400, 30.5, "60"]) {
      r = await call(admin, "PATCH", "/api/admin/settings", { bookingHorizonDays: bad });
      check(`admin horizon ${JSON.stringify(bad)} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
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
