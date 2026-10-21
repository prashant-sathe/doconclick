// IST calendar maths (BUG-TRACKER #50): months, days, weekdays and time of
// day come out the same whatever timezone the device or server runs in.
// Pure checks — run under several zones by `npm run test:ist-dates` — then,
// if a dev server is up, the doctor analytics API buckets a payment at 00:30
// IST on the 1st into that month (a UTC month key says the previous one).
//
//   npm run test:ist-dates
import "dotenv/config";
import { execFileSync } from "child_process";
import jwt from "jsonwebtoken";
import {
  istDayKey, istMonthKey, shiftMonthKey, istStartOfMonth, monthShortLabel,
  addDaysYmd, mondayIndex, weekdayShortLabel, istMinutesOfDay,
} from "../src/lib/istDate";

const ZONES = ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Kiritimati"];
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

function pure() {
  const zone = process.env.TZ ?? "(system)";
  // 00:30 IST on 1 Nov 2026 = 19:00 UTC on 31 Oct.
  const firstNov = new Date("2026-10-31T19:00:00Z");
  check(`[${zone}] 00:30 IST on 1 Nov is November`, istMonthKey(firstNov) === "2026-11" && istDayKey(firstNov) === "2026-11-01", `${istMonthKey(firstNov)} ${istDayKey(firstNov)}`);
  check(`[${zone}] 23:45 IST on 31 Oct is October`, istMonthKey(new Date("2026-10-31T18:15:00Z")) === "2026-10", "ok");
  check(`[${zone}] month shifting across a year`, shiftMonthKey("2026-01", -1) === "2025-12" && shiftMonthKey("2026-11", 3) === "2027-02", "ok");
  check(`[${zone}] start of an IST month`, istStartOfMonth("2026-11").toISOString() === "2026-10-31T18:30:00.000Z", istStartOfMonth("2026-11").toISOString());
  check(`[${zone}] month label`, monthShortLabel("2026-11") === "Nov" && monthShortLabel("2027-01") === "Jan", `${monthShortLabel("2026-11")} ${monthShortLabel("2027-01")}`);
  check(`[${zone}] weekday maths (21 Oct 2026 is a Wednesday)`, mondayIndex("2026-10-21") === 2 && weekdayShortLabel("2026-10-21") === "Wed" && addDaysYmd("2026-10-21", -2) === "2026-10-19" && addDaysYmd("2026-12-31", 1) === "2027-01-01", "ok");
  check(`[${zone}] time of day in IST (19:00 UTC = 00:30 IST)`, istMinutesOfDay(firstNov) === 30 && istMinutesOfDay(new Date("2026-10-31T18:15:00Z")) === 23 * 60 + 45, `${istMinutesOfDay(firstNov)}`);
  const shown = new Date("2026-10-31T19:00:00Z").toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  check(`[${zone}] a formatted time with timeZone reads in IST`, shown.includes("1 Nov") && shown.includes("12:30"), shown);
}

async function analytics() {
  const { prisma } = await import("../src/lib/prisma");
  const SECRET = process.env.JWT_SECRET!;
  const stamp = String(Date.now()).slice(-8);
  const thisMonth = istMonthKey(new Date());
  // A payment at 00:30 IST on the 1st of this IST month: UTC would file it
  // under last month.
  const start = istStartOfMonth(thisMonth);
  const firstMinutes = new Date(start.getTime() + 30 * 60_000);
  const lastOfPrev = new Date(start.getTime() - 15 * 60_000); // 23:45 IST on the last day of last month
  const doctor = await prisma.user.create({ data: {
    name: "IST Doctor", mobile: `5${stamp}1`, role: "DOCTOR", termsAcceptedAt: new Date(),
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 864e5) } },
  } });
  const patient = await prisma.user.create({ data: { name: "IST Patient", mobile: `5${stamp}2`, role: "PATIENT", termsAcceptedAt: new Date() } });
  const appt = (scheduledAt: Date, amount: number) => prisma.appointment.create({ data: {
    doctorId: doctor.id, patientId: patient.id, status: "COMPLETED", paymentStatus: "PAID", consultType: "VIDEO", symptoms: "x",
    amount, platformFee: 0, paymentMethod: "CASH", scheduledAt, createdAt: scheduledAt, paidAt: scheduledAt,
  } as never });
  try {
    await appt(firstMinutes, 700);
    await appt(lastOfPrev, 300);
    const res = await fetch(`${BASE}/api/doctor/analytics`, {
      headers: { Cookie: `doconclick_token=${jwt.sign({ id: doctor.id, name: doctor.name, role: "DOCTOR", mobile: doctor.mobile, tv: 0 }, SECRET)}` },
    });
    const data = (await res.json()) as { months: { label: string; gross: number }[] };
    const months = data.months ?? [];
    const cur = months[months.length - 1];
    const prev = months[months.length - 2];
    check("analytics: 6 months, ending with this IST month", res.status === 200 && months.length === 6 && cur?.label === monthShortLabel(thisMonth), `${res.status} ${months.map((m) => m.label).join(",")}`);
    check("analytics: 00:30 IST on the 1st counts in this month", cur?.gross === 700, `this ${cur?.gross}`);
    check("analytics: 23:45 IST on the last day counts in last month", prev?.gross === 300, `last ${prev?.gross}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: doctor.id } });
    await prisma.user.deleteMany({ where: { id: { in: [doctor.id, patient.id] } } });
    await prisma.$disconnect();
  }
}

async function main() {
  if (process.env.IST_DATES_CHILD) {
    pure();
    process.exit(failures ? 1 : 0);
  }
  // The pure checks again under each zone, as separate processes (TZ is read at startup).
  for (const zone of ZONES) {
    try {
      process.stdout.write(execFileSync(process.execPath, [...process.execArgv, __filename], { env: { ...process.env, TZ: zone, IST_DATES_CHILD: "1" } }).toString());
    } catch (e) {
      process.stdout.write(String((e as { stdout?: Buffer }).stdout ?? e));
      failures++;
    }
  }
  const up = await fetch(`${BASE}/api/auth/me`).then(() => true).catch(() => false);
  if (up) await analytics();
  else console.log("(analytics API check skipped — no dev server)");

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
