// Doctor "Available Timings" (BUG-TRACKER #61): several time ranges a day
// (";"-separated segments, every old single-range string still reads the
// same), start must be before end, ranges on a day mustn't overlap, and an
// empty or unreadable value is an error — never quietly "Mon–Fri". Pure
// checks, then the doctor profile API against a live dev server and the DB
// in .env, throwaway users only.
//
//   npm run test:availability
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import {
  parseAvailabilityString, isValidAvailability, isDoctorAvailableNow, formatAvailability,
  availabilityProblem, availabilityToBlocks, availabilityFromBlocks,
} from "../src/lib/availability";
import { doctorHoursProblem } from "../src/lib/bookingLimits";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}
// 19 Oct 2026 is a Monday; IST = UTC+5:30.
const mondayIST = (hhmm: string) => new Date(`2026-10-19T${hhmm}:00+05:30`);

async function main() {
  // ── Old strings read exactly as before ──
  for (const [raw, rows, shown] of [
    ["Mon-Fri, 9AM-5PM", 5, "Mon–Fri, 9 AM–5 PM"],
    ["Tue-Thu-Sat, 10AM-4PM", 3, "Tue, Thu, Sat, 10 AM–4 PM"],
    ["Mon, Tue, Wed, Thu, Fri 09:00–18:00", 5, "Mon–Fri, 9 AM–6 PM"],
    ["Mon, Tue, Wed, Thu, Fri, Sat, Sun 00:00–23:59", 7, "Mon–Sun, 12 AM–11:59 PM"],
  ] as const) {
    check(`old "${raw}" → ${rows} rows, "${shown}"`, parseAvailabilityString(raw).length === rows && formatAvailability(raw) === shown && isValidAvailability(raw), `${parseAvailabilityString(raw).length} · ${formatAvailability(raw)}`);
  }

  // ── Several ranges ──
  const split = "Mon, Tue, Wed, Thu, Fri 09:00–13:00; Mon, Tue, Wed, Thu, Fri 17:00–20:00; Sat 10:00–14:00";
  const rows = parseAvailabilityString(split);
  check("split shift parses: Mon twice, Sat once (11 rows)", rows.length === 11 && rows.filter((r) => r.dayOfWeek === "Mon").length === 2 && rows.filter((r) => r.dayOfWeek === "Sat").length === 1, `${rows.length}`);
  check("…shown to patients as 'Mon–Fri, 9 AM–1 PM & 5 PM–8 PM; Sat, 10 AM–2 PM'", formatAvailability(split) === "Mon–Fri, 9 AM–1 PM & 5 PM–8 PM; Sat, 10 AM–2 PM", formatAvailability(split));
  check("open Mon 10:00 and 18:00, closed 14:00 and 21:00 (IST)", isDoctorAvailableNow(split, mondayIST("10:00")) && isDoctorAvailableNow(split, mondayIST("18:00")) && !isDoctorAvailableNow(split, mondayIST("14:00")) && !isDoctorAvailableNow(split, mondayIST("21:00")), "ok");
  check("booking hours check uses every range (14:00 refused with both ranges in the message, 18:00 fine)", doctorHoursProblem(split, mondayIST("18:00")) === null && (doctorHoursProblem(split, mondayIST("14:00")) ?? "").includes("9 AM–1 PM & 5 PM–8 PM"), String(doctorHoursProblem(split, mondayIST("14:00"))));
  check("one unreadable range makes the whole value invalid", !isValidAvailability("Mon 09:00–13:00; nonsense") && parseAvailabilityString("Mon 09:00–13:00; nonsense").length === 0, "ok");
  check("nurse-style overnight range still valid for isValidAvailability", isValidAvailability("Mon 20:00–02:00"), "ok");

  // ── The doctor form's rules ──
  const probs: [string, string, RegExp | null][] = [
    ["empty", "", /at least one day/],
    ["end before start", "Mon, Tue 18:00–09:00", /end time \(9 AM\) must be after the start time \(6 PM\)/],
    ["end equals start", "Mon 09:00–09:00", /must be after/],
    ["overlap on a shared day", "Mon, Tue 09:00–13:00; Tue, Wed 12:00–15:00", /Tue: 9 AM–1 PM and 12 PM–3 PM overlap/],
    ["unreadable range", "Mon 09:00–13:00; whenever", /Range 2: pick at least one day/],
    ["11 ranges", Array.from({ length: 11 }, (_, i) => `Mon ${String(i + 8).padStart(2, "0")}:00–${String(i + 8).padStart(2, "0")}:30`).join("; "), /At most 10/],
    ["touching ranges (13:00 then 13:00)", "Mon 09:00–13:00; Mon 13:00–17:00", null],
    ["split shift", split, null],
    ["an old seed string", "Mon-Fri, 9AM-5PM", null],
  ];
  for (const [label, value, want] of probs) {
    const p = availabilityProblem(value);
    check(`availabilityProblem: ${label} → ${want ? "error" : "ok"}`, want ? !!p && want.test(p) : p === null, String(p));
  }
  const blocks = availabilityToBlocks("Tue, Mon 9AM-1PM; Sat 10:00–14:00");
  check("blocks round-trip in week order, canonical times", JSON.stringify(blocks) === JSON.stringify([{ days: ["Mon", "Tue"], from: "09:00", to: "13:00" }, { days: ["Sat"], from: "10:00", to: "14:00" }]) && availabilityFromBlocks(blocks!) === "Mon, Tue 09:00–13:00; Sat 10:00–14:00", availabilityFromBlocks(blocks ?? []));
  check("an unreadable value gives no blocks (the form says so)", availabilityToBlocks("by appointment") === null, "ok");

  // ── API ──
  const stamp = String(Date.now()).slice(-8);
  const doctor = await prisma.user.create({ data: { name: "Hours Doctor", mobile: `3${stamp}9`, role: "DOCTOR", termsAcceptedAt: new Date(), doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * 864e5), availability: "Mon-Fri, 9AM-5PM" } } } });
  const cookie = `doconclick_token=${jwt.sign({ id: doctor.id, name: doctor.name, role: "DOCTOR", mobile: doctor.mobile, tv: 0 }, SECRET)}`;
  const patch = async (availability: unknown) => {
    const res = await fetch(`${BASE}/api/doctors/me`, { method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ availability }) });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as { error?: string } };
  };
  const stored = async () => (await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctor.id } })).availability;
  try {
    for (const [label, value, want] of [
      ["end before start", "Mon 18:00–09:00", /must be after/],
      ["overlapping ranges", "Mon 09:00–13:00; Mon 12:00–15:00", /overlap/],
      ["empty (no silent Mon–Fri)", "", /at least one day/],
      ["free text", "by appointment", /^Pick at least one day/],
      ["not a string", 42, /at least one day/],
    ] as const) {
      const r = await patch(value);
      check(`PATCH ${label} → 400`, r.status === 400 && want.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    }
    check("…and the saved hours are untouched", (await stored()) === "Mon-Fri, 9AM-5PM", await stored());
    const r = await patch("Wed, Mon 9:00AM–1:00PM;Mon,Wed 17:00-20:00");
    check("PATCH a split shift → 200, stored in the canonical form", r.status === 200 && (await stored()) === "Mon, Wed 09:00–13:00; Mon, Wed 17:00–20:00", `${r.status} ${await stored()}`);
    const pub = await fetch(`${BASE}/api/doctors/${doctor.id}`).then((x) => x.json()) as { doctorProfile: { availability: string } };
    check("the public profile carries it, and it formats for patients", formatAvailability(pub.doctorProfile.availability) === "Mon, Wed, 9 AM–1 PM & 5 PM–8 PM", formatAvailability(pub.doctorProfile.availability));
  } finally {
    await prisma.user.delete({ where: { id: doctor.id } });
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
