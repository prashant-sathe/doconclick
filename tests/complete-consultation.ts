// One-shot "complete consultation" (BUG-TRACKER F4, builds on #3):
// POST /api/appointments/[id]/complete saves notes, medicines + tests, files
// and a nurse referral and marks the visit COMPLETED together — or changes
// nothing. Every completion guard (paid, arrived, still accepted, the
// doctor's own visit, plan active) refuses before anything is written; a bad
// file or referral is caught before anything is uploaded; two taps at once
// complete it once. Against a live dev server and the DB in .env, throwaway
// users only. Uploads a few tiny real files to the S3 bucket in .env and
// deletes them again.
//
//   npm run test:complete-consultation   (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import fs from "fs";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { deleteFromS3 } from "../src/lib/s3";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const HTML = Buffer.from("<!doctype html><script>alert(1)</script>");

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
type F = { bytes: Buffer; type: string; name: string };
async function complete(as: U, id: string, data: unknown, files: F[] = []) {
  const form = new FormData();
  form.append("data", JSON.stringify(data));
  for (const f of files) form.append("file", new Blob([new Uint8Array(f.bytes)], { type: f.type }), f.name);
  const res = await fetch(`${BASE}/api/appointments/${id}/complete`, { method: "POST", headers: { Cookie: cookieFor(as) }, body: form });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}

async function main() {
  // The bucket credentials come from .env — never from the shell (they may be
  // someone else's). dotenv/config doesn't override set variables, so swap
  // AWS_* here, before the first S3 call builds its client.
  for (const k of Object.keys(process.env)) if (k.startsWith("AWS_")) delete process.env[k];
  for (const [k, v] of Object.entries(dotenv.parse(fs.readFileSync(".env")))) if (k.startsWith("AWS_")) process.env[k] = v;

  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `7${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const profile = (extra: Record<string, unknown> = {}) => ({ create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), ...extra } });
  const doctor = await mk({ name: "Complete Doctor", role: "DOCTOR", doctorProfile: profile() });
  const other = await mk({ name: "Other Doctor", role: "DOCTOR", doctorProfile: profile() });
  const expired = await mk({ name: "Expired Doctor", role: "DOCTOR", doctorProfile: profile({ trialEndsAt: new Date(Date.now() - DAY) }) });
  const desk = await mk({ name: "Complete Desk", role: "STAFF" });
  await prisma.staffProfile.create({ data: { userId: desk.id, doctorId: doctor.id } });
  const patient = await mk({ name: "Complete Patient", role: "PATIENT", password: "x", patientProfile: { create: { age: 30, gender: "Male" } } });
  const service = await prisma.nurseService.findFirst({ where: { isActive: true } });
  if (!service) throw new Error("No active nurse service in the DB to refer to");

  const visit = (doctorId: string, extra: Record<string, unknown> = {}) =>
    prisma.appointment.create({ data: { patientId: patient.id, doctorId, symptoms: "COMPLETE-TEST", consultType: "CLINIC", status: "SCHEDULED", paymentMethod: "CASH", amount: 500, ...extra } });
  const state = async (id: string) => {
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id }, include: { medicines: true, tests: true, attachments: true, referralGiven: true, prescriptionVersions: true } });
    return a;
  };
  const untouched = async (id: string) => {
    const a = await state(id);
    return a.status === "SCHEDULED" && a.medicines.length === 0 && a.tests.length === 0 && a.attachments.length === 0 && !a.referralGiven && a.doctorNotes === null && a.prescriptionVersions.length === 0;
  };
  const full = {
    doctorNotes: "Viral fever. Rest and fluids.",
    chiefComplaints: "Fever for 3 days", history: "No known allergies", examination: "Throat congested", findings: "temp 101 f", diagnosis: "viral fever",
    medicines: [
      { name: "Paracetamol 650", dosage: "1 tab", frequency: "Thrice a day", duration: "3 days", instructions: "After food" },
      { name: "  ", dosage: "dropped — no name" },
      { name: "ORS", dosage: "1 sachet", frequency: "Twice a day", duration: "2 days" },
    ],
    tests: [{ name: "CBC", instructions: "If fever persists" }],
    nurseReferral: { serviceId: service.id, visits: 3, intervalDays: 1, instructions: "Check temperature" },
  };
  const twoFiles: F[] = [{ bytes: PNG, type: "image/png", name: "rash.png" }, { bytes: PDF, type: "application/pdf", name: "report.pdf" }];
  const uploadedUrls: string[] = [];

  try {
    // ── Who ──
    const a = await visit(doctor.id);
    let r = await complete(patient, a.id, full);
    check("patient → 403", r.status === 403, `${r.status}`);
    r = await complete(desk, a.id, full);
    check("front desk → 403, only the doctor", r.status === 403 && /Only the doctor/.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    r = await complete(other, a.id, full);
    check("another doctor → 404", r.status === 404, `${r.status}`);
    const exp = await visit(expired.id);
    r = await complete(expired, exp.id, full);
    check("doctor out of plan → 403", r.status === 403, `${r.status} ${r.json.code}`);
    check("…nothing written by any of them", await untouched(a.id) && await untouched(exp.id), "untouched");

    // ── Guards refuse before anything is written ──
    const unpaid = await visit(doctor.id, { consultType: "VIDEO", paymentMethod: "ONLINE", paymentStatus: "PENDING" });
    r = await complete(doctor, unpaid.id, full, twoFiles);
    check("unpaid online consult → 400 UNPAID", r.status === 400 && r.json.code === "UNPAID", `${r.status} ${r.json.code}`);
    check("…no notes, prescription, files or referral saved, still open (bug #3)", await untouched(unpaid.id), "untouched");
    const home = await visit(doctor.id, { consultType: "HOME", travelStatus: "ON_THE_WAY" });
    r = await complete(doctor, home.id, full);
    check("home visit not arrived → 400 NOT_ARRIVED, nothing saved", r.status === 400 && r.json.code === "NOT_ARRIVED" && await untouched(home.id), `${r.status} ${r.json.code}`);
    const pending = await visit(doctor.id, { status: "PENDING_APPROVAL" });
    r = await complete(doctor, pending.id, full);
    check("not yet accepted → 409 NOT_SCHEDULED", r.status === 409 && r.json.code === "NOT_SCHEDULED", `${r.status} ${r.json.code}`);

    // ── Bad input is caught before anything is uploaded or written ──
    r = await complete(doctor, a.id, full, [twoFiles[0], { bytes: HTML, type: "image/png", name: "evil.png" }]);
    check("one bad file (HTML as PNG) → 400 INVALID_FILE, nothing saved", r.status === 400 && r.json.code === "INVALID_FILE" && await untouched(a.id), `${r.status} ${r.json.error}`);
    r = await complete(doctor, a.id, { ...full, nurseReferral: { serviceId: "nope", visits: 1, intervalDays: 1 } });
    check("unknown nurse service → 400 INVALID_REFERRAL, nothing saved", r.status === 400 && r.json.code === "INVALID_REFERRAL" && await untouched(a.id), `${r.status} ${r.json.error}`);
    r = await complete(doctor, a.id, { ...full, nurseReferral: { serviceId: service.id, visits: 99, intervalDays: 1 } });
    check("too many referral visits → 400", r.status === 400 && await untouched(a.id), `${r.status} ${r.json.error}`);
    r = await complete(doctor, a.id, full, Array.from({ length: 11 }, (_, i) => ({ bytes: PNG, type: "image/png", name: `p${i}.png` })));
    check("11 files → 400", r.status === 400 && await untouched(a.id), `${r.status} ${r.json.error}`);
    r = await complete(doctor, a.id, { ...full, doctorNotes: "x".repeat(5001) });
    check("notes too long → 400", r.status === 400 && await untouched(a.id), `${r.status}`);
    r = await complete(doctor, a.id, { ...full, medicines: "not a list" });
    check("medicines not a list → 400", r.status === 400 && await untouched(a.id), `${r.status}`);

    // ── Everything at once ──
    r = await complete(doctor, a.id, full, twoFiles);
    const done = await state(a.id);
    uploadedUrls.push(...done.attachments.map((x) => x.url));
    check("complete with notes, items, 2 files and a referral → 200", r.status === 200 && r.json.status === "COMPLETED", `${r.status} ${r.json.error ?? ""}`);
    check("…COMPLETED with completedAt, cash marked PAID", done.status === "COMPLETED" && !!done.completedAt && done.paymentStatus === "PAID" && !!done.paidAt, `${done.status}/${done.paymentStatus}`);
    check("…notes saved", done.doctorNotes === full.doctorNotes, String(done.doctorNotes));
    check("…clinical fields saved; findings + diagnosis upper-cased, the rest as typed", done.chiefComplaints === "Fever for 3 days" && done.history === "No known allergies" && done.examination === "Throat congested" && done.findings === "TEMP 101 F" && done.diagnosis === "VIRAL FEVER", `${done.findings}/${done.diagnosis}`);
    check("…2 medicines (blank row dropped) and 1 test", done.medicines.length === 2 && done.tests.length === 1 && done.medicines.some((m) => m.name === "Paracetamol 650" && m.instructions === "After food"), `${done.medicines.length}/${done.tests.length}`);
    check("…kept as prescription version 1", done.prescriptionVersions.length === 1 && done.prescriptionVersions[0].version === 1, `${done.prescriptionVersions.length}`);
    check("…2 files on S3, with their names", done.attachments.length === 2 && done.attachments.every((x) => x.url.startsWith("https://")) && done.attachments.some((x) => x.fileName === "report.pdf"), `${done.attachments.length}`);
    check("…nurse referral saved", done.referralGiven?.serviceId === service.id && done.referralGiven.visits === 3, `${done.referralGiven?.visits}`);
    check("…response carries the saved prescription", (r.json.medicines as unknown[])?.length === 2 && (r.json.attachments as unknown[])?.length === 2 && !("visitOtp" in r.json), "ok");
    const rx = await call(patient, "GET", `/api/appointments/${a.id}/prescription`);
    check("patient can now open the prescription", rx.status === 200 && (rx.json.medicines as unknown[]).length === 2 && rx.json.doctorNotes === full.doctorNotes && rx.json.diagnosis === "VIRAL FEVER", `${rx.status}`);
    const ref = await call(patient, "GET", `/api/nurse-referrals/${done.referralGiven!.id}`);
    check("…and the referral is usable (consult completed)", ref.status === 200, `${ref.status} ${ref.json.error ?? ""}`);

    r = await complete(doctor, a.id, full, twoFiles);
    check("completing again → 409 ALREADY_COMPLETED, no extra files", r.status === 409 && r.json.code === "ALREADY_COMPLETED" && (await state(a.id)).attachments.length === 2, `${r.status} ${r.json.code}`);

    // ── Plain JSON, nothing else to save ──
    const paid = await visit(doctor.id, { consultType: "VIDEO", paymentMethod: "ONLINE", paymentStatus: "PAID", paidAt: new Date() });
    const res = await fetch(`${BASE}/api/appointments/${paid.id}/complete`, { method: "POST", headers: { Cookie: cookieFor(doctor), "Content-Type": "application/json" }, body: JSON.stringify({ medicines: [{ name: "Cetirizine" }] }) });
    const paidDone = await state(paid.id);
    check("JSON body, paid online, one medicine → 200, no referral", res.status === 200 && paidDone.status === "COMPLETED" && paidDone.medicines.length === 1 && !paidDone.referralGiven && paidDone.doctorNotes === null, `${res.status}`);

    // ── Two taps at once ──
    const race = await visit(doctor.id);
    const [r1, r2] = await Promise.all([
      complete(doctor, race.id, full, [twoFiles[0]]),
      complete(doctor, race.id, full, [twoFiles[0]]),
    ]);
    const raced = await state(race.id);
    uploadedUrls.push(...raced.attachments.map((x) => x.url));
    check("two simultaneous completes → one 200, one 409", [r1.status, r2.status].sort().join(",") === "200,409", `${r1.status}, ${r2.status}`);
    check("…saved once: 1 file, 2 medicines, 1 version", raced.attachments.length === 1 && raced.medicines.length === 2 && raced.prescriptionVersions.length === 1, `${raced.attachments.length} files, ${raced.medicines.length} meds`);

    // ── The amend routes still work afterwards ──
    r = await call(doctor, "POST", `/api/appointments/${a.id}/prescription-items`, { medicines: [{ name: "Paracetamol 500", dosage: "1 tab", frequency: "Twice a day", duration: "3 days" }], tests: [] });
    check("amending within 24h via prescription-items → 200, version 2", r.status === 200 && (await state(a.id)).prescriptionVersions.length === 2, `${r.status} ${r.json.error ?? ""}`);
    r = await call(doctor, "POST", `/api/appointments/${a.id}/prescription-items`, { tests: [] });
    check("…medicines missing → 400", r.status === 400, `${r.status}`);
    r = await call(doctor, "POST", `/api/appointments/${a.id}/nurse-referral`, { serviceId: "nope" });
    check("nurse-referral route still validates → 400", r.status === 400, `${r.status}`);

    const page = await fetch(`${BASE}/doctor/dashboard`, { headers: { Cookie: cookieFor(doctor) }, redirect: "manual" });
    check("doctor dashboard renders", page.status === 200, `${page.status}`);
  } finally {
    const all = await prisma.prescriptionAttachment.findMany({ where: { appointment: { doctorId: { in: ids } } }, select: { url: true } });
    await Promise.all([...new Set([...uploadedUrls, ...all.map((x) => x.url)])].map((u) => deleteFromS3(u, "prescriptions")));
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.staffProfile.deleteMany({ where: { OR: [{ userId: { in: ids } }, { doctorId: { in: ids } }] } });
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
