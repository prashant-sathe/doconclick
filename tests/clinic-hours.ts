// Doctor fees + clinic hours validation, and overnight slot handling
// (BUG-TRACKER #25). Pure checks on src/lib/clinicAvailability.ts, then API
// checks against a live dev server and the DB in .env, throwaway users only.
//
//   npm run test:clinic-hours
import "dotenv/config";
import fs from "fs";
import { parse } from "dotenv";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { isClinicOpenNow, generateSlotsForDate, findNextOpening, validateSlotInput } from "../src/lib/clinicAvailability";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// An instant at hh:mm IST on a given IST date ("2026-10-19" is a Monday).
const ist = (date: string, hh: number, mm = 0) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - 5.5 * 3600_000);
};
const MON = "2026-10-19", TUE = "2026-10-20";
const earlier = new Date("2026-10-01T00:00:00Z"); // a "now" well before those dates

async function main() {
  // ── Reading hours ──
  const legacyOvernight = [{ dayOfWeek: "Mon", fromTime: "20:00", toTime: "02:00" }];
  check("legacy overnight: open Mon 21:00", isClinicOpenNow(legacyOvernight, ist(MON, 21)), "open");
  check("legacy overnight: closed Mon 01:00 (was wrongly open)", !isClinicOpenNow(legacyOvernight, ist(MON, 1)), "closed");
  check("legacy overnight: open Tue 01:00 (the tail)", isClinicOpenNow(legacyOvernight, ist(TUE, 1)), "open");
  check("legacy overnight: closed Tue 03:00", !isClinicOpenNow(legacyOvernight, ist(TUE, 3)), "closed");

  const toMidnight = [{ dayOfWeek: "Mon", fromTime: "20:00", toTime: "00:00" }];
  check("until-midnight: open Mon 23:30", isClinicOpenNow(toMidnight, ist(MON, 23, 30)), "open");
  check("until-midnight: closed Tue 00:30", !isClinicOpenNow(toMidnight, ist(TUE, 0, 30)), "closed");

  const monGrid = generateSlotsForDate(legacyOvernight, MON, earlier).map((s) => s.time);
  const tueGrid = generateSlotsForDate(legacyOvernight, TUE, earlier).map((s) => s.time);
  check("legacy overnight grid: Mon 20:00–23:50 (was empty)", monGrid.length === 24 && monGrid[0] === "20:00" && monGrid.at(-1) === "23:50", `${monGrid.length} slots, ${monGrid[0]}…${monGrid.at(-1)}`);
  check("legacy overnight grid: Tue 00:00–01:50", tueGrid.length === 12 && tueGrid[0] === "00:00" && tueGrid.at(-1) === "01:50", `${tueGrid.length} slots, ${tueGrid[0]}…${tueGrid.at(-1)}`);
  const midGrid = generateSlotsForDate(toMidnight, MON, earlier).map((s) => s.time);
  check("until-midnight grid ends 23:50", midGrid.at(-1) === "23:50" && midGrid.length === 24, `${midGrid.length} slots`);
  const day = generateSlotsForDate([{ dayOfWeek: "Mon", fromTime: "09:00", toTime: "10:00" }], MON, earlier).map((s) => s.time);
  check("ordinary range unchanged", day.join() === "09:00,09:10,09:20,09:30,09:40,09:50", day.join());
  const next = findNextOpening([{ slots: legacyOvernight }], ist(MON, 12));
  check("next opening for a legacy overnight clinic", next?.dayOfWeek === "Mon" && next.fromTime === "20:00", JSON.stringify(next && { d: next.dayOfWeek, t: next.fromTime }));

  // ── Validating hours ──
  const bad: [string, unknown][] = [
    ["empty", []],
    ["not a day", [{ dayOfWeek: "Funday", fromTime: "09:00", toTime: "17:00" }]],
    ["25:99", [{ dayOfWeek: "Mon", fromTime: "25:99", toTime: "26:00" }]],
    ["single-digit hour", [{ dayOfWeek: "Mon", fromTime: "9:00", toTime: "17:00" }]],
    ["from after to", [{ dayOfWeek: "Mon", fromTime: "18:00", toTime: "09:00" }]],
    ["from equals to", [{ dayOfWeek: "Mon", fromTime: "09:00", toTime: "09:00" }]],
    ["overlap", [{ dayOfWeek: "Mon", fromTime: "09:00", toTime: "13:00" }, { dayOfWeek: "Mon", fromTime: "12:00", toTime: "18:00" }]],
    ["duplicate", [{ dayOfWeek: "Tue", fromTime: "09:00", toTime: "13:00" }, { dayOfWeek: "Tue", fromTime: "09:00", toTime: "13:00" }]],
    ["overlap with until-midnight", [{ dayOfWeek: "Mon", fromTime: "20:00", toTime: "00:00" }, { dayOfWeek: "Mon", fromTime: "22:00", toTime: "23:00" }]],
  ];
  for (const [label, slots] of bad) {
    const r = validateSlotInput(slots);
    check(`rejects ${label}`, "error" in r, "error" in r ? r.error : "accepted");
  }
  const good = validateSlotInput([
    { dayOfWeek: "Mon", fromTime: "09:00", toTime: "13:00" },
    { dayOfWeek: "Mon", fromTime: "13:00", toTime: "17:00" }, // touching is fine
    { dayOfWeek: "Mon", fromTime: "20:00", toTime: "00:00" }, // until midnight
    { dayOfWeek: "Tue", fromTime: "00:00", toTime: "02:00" }, // the after-midnight part
    { dayOfWeek: "Sun", fromTime: "09:00", toTime: "13:00" }, // same times another day
  ]);
  check("accepts touching ranges, until-midnight and the next-day tail", !("error" in good), "error" in good ? good.error : "ok");

  // ── API ──
  const stamp = String(Date.now()).slice(-8);
  const doctor = await prisma.user.create({
    data: {
      name: "Hours Doctor", mobile: `1${stamp}7`, role: "DOCTOR",
      doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 864e5) } },
    },
  });
  const cookie = `doconclick_token=${jwt.sign({ id: doctor.id, name: doctor.name, role: "DOCTOR", mobile: doctor.mobile, tv: 0 }, SECRET)}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  try {
    // Fees
    for (const [label, body] of [
      ["negative fee", { consultFee: -1 }],
      ["NaN fee", { videoFee: "abc" }],
      ["too large", { homeVisitFee: 50001 }],
      ["boolean", { consultFee: true }],
      ["Infinity string", { consultFee: "Infinity" }],
      ["experience not a number", { experience: "ten" }],
      ["fractional experience", { experience: 2.5 }],
      ["latitude 999", { lat: 999 }],
    ] as const) {
      const r = await call("PATCH", "/api/doctors/me", body);
      check(`fees: rejects ${label}`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    let r = await call("PATCH", "/api/doctors/me", { consultFee: "499.999", videoFee: "", homeVisitFee: 50000, experience: "12" });
    const p = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctor.id } });
    check("fees: valid values saved (rounded, blank → 0)", r.status === 200 && p.consultFee === 500 && p.videoFee === 0 && p.homeVisitFee === 50000 && p.experience === 12,
      `${r.status} ${p.consultFee}/${p.videoFee}/${p.homeVisitFee}/${p.experience}`);

    // Clinics
    // The dev server reads the bucket from .env (it's started with the shell's
    // AWS_* unset), so build "our" URL from .env too, not process.env.
    const fileEnv = parse(fs.readFileSync(".env"));
    const bucketPhoto = `https://${fileEnv.S3_BUCKET_NAME}.s3.${fileEnv.AWS_REGION}.amazonaws.com/doctor-docs/clinic-test-${stamp}.jpg`;
    const clinic = (extra: Record<string, unknown>) => ({
      name: "Hours Clinic", address: "1 Test Rd", lat: 18.5, lng: 73.8,
      slots: [{ dayOfWeek: "Mon", fromTime: "09:00", toTime: "17:00" }], ...extra,
    });
    for (const [label, body] of [
      ["day name", clinic({ slots: [{ dayOfWeek: "Funday", fromTime: "09:00", toTime: "17:00" }] })],
      ["bad time", clinic({ slots: [{ dayOfWeek: "Mon", fromTime: "25:99", toTime: "26:00" }] })],
      ["from > to", clinic({ slots: [{ dayOfWeek: "Mon", fromTime: "18:00", toTime: "09:00" }] })],
      ["overlap", clinic({ slots: [{ dayOfWeek: "Mon", fromTime: "09:00", toTime: "13:00" }, { dayOfWeek: "Mon", fromTime: "12:00", toTime: "14:00" }] })],
      ["external photo", clinic({ photoUrl: "https://evil.example.com/x.jpg" })],
      ["javascript: photo", clinic({ photoUrl: "javascript:alert(1)" })],
      ["other bucket folder", clinic({ photoUrl: bucketPhoto.replace("/doctor-docs/", "/patient-photos/") })],
      ["path traversal", clinic({ photoUrl: bucketPhoto.replace("clinic-test", "../patient-photos/x") })],
      ["latitude 999", clinic({ lat: 999 })],
    ] as const) {
      r = await call("POST", "/api/doctors/me/clinics", body);
      check(`clinic: rejects ${label}`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    r = await call("POST", "/api/doctors/me/clinics", clinic({ photoUrl: bucketPhoto, slots: [
      { dayOfWeek: "Mon", fromTime: "20:00", toTime: "00:00" }, { dayOfWeek: "Tue", fromTime: "00:00", toTime: "02:00" },
    ] }));
    check("clinic: our bucket photo + overnight-as-two-slots accepted", r.status === 200 && r.json.photoUrl === bucketPhoto && r.json.slots?.length === 2, `${r.status} ${r.json.error ?? ""}`);
    const created = r.json.id as string;
    if (!created) throw new Error("clinic create failed — can't run the edit checks");

    // A legacy external photo can be kept while editing, not swapped for another.
    await prisma.clinic.update({ where: { id: created }, data: { photoUrl: "https://legacy.example.com/old.jpg" } });
    r = await call("PATCH", `/api/doctors/me/clinics/${created}`, clinic({ photoUrl: "https://legacy.example.com/old.jpg" }));
    check("clinic edit: unchanged legacy photo allowed", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call("PATCH", `/api/doctors/me/clinics/${created}`, clinic({ photoUrl: "https://legacy.example.com/new.jpg" }));
    check("clinic edit: new external photo rejected", r.status === 400, `${r.status}`);
    r = await call("PATCH", `/api/doctors/me/clinics/${created}`, clinic({ slots: [{ dayOfWeek: "Mon", fromTime: "9:00", toTime: "17:00" }] }));
    check("clinic edit: bad slots rejected", r.status === 400, `${r.status} ${r.json.error}`);

    // A legacy overnight clinic's after-midnight tail is bookable on the next day.
    const legacy = await prisma.clinic.create({
      data: { doctorId: doctor.id, name: "Legacy Night Clinic", address: "2 Test Rd", lat: 18.5, lng: 73.8, slots: { create: legacyOvernight } },
    });
    const futureTue = (() => {
      const d = new Date(Date.now() + 5.5 * 3600_000);
      do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() !== 2);
      return d.toISOString().slice(0, 10);
    })();
    // The slots API needs a signed-in user (any role).
    const slotsRes = await fetch(`${BASE}/api/doctors/${doctor.id}/slots?clinicId=${legacy.id}&date=${futureTue}`, { headers: { Cookie: cookie } });
    const body = await slotsRes.json().catch(() => ({}));
    const times = JSON.stringify(body);
    check("slots API offers the overnight tail on Tuesday", slotsRes.status === 200 && times.includes("01:00") && !times.includes("03:00"), `${slotsRes.status} ${times.slice(0, 120)}`);
  } finally {
    await prisma.user.deleteMany({ where: { id: doctor.id } });
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
