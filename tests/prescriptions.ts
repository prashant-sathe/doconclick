// Prescriptions (BUG-TRACKER #34): edit lock (accepted, or ≤24h after
// completion; never cancelled/declined), version history, the dependent's own
// age/gender on the document, and doctor/admin access to the issued copy.
// Pure checks, then API checks against a live dev server and the DB in .env,
// throwaway users only.
//
//   npm run test:prescriptions
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { prescriptionEditProblem, PRESCRIPTION_EDIT_WINDOW_HOURS } from "../src/lib/prescriptionLock";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const HOUR = 60 * 60_000;
const hoursAgo = (n: number) => new Date(Date.now() - n * HOUR);

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

async function main() {
  // ── The rule ──
  const at = { scheduledAt: hoursAgo(1) };
  check("scheduled → editable", prescriptionEditProblem({ status: "SCHEDULED", completedAt: null, ...at }) === null, "null");
  check(`completed ${PRESCRIPTION_EDIT_WINDOW_HOURS - 1}h ago → editable`, prescriptionEditProblem({ status: "COMPLETED", completedAt: hoursAgo(PRESCRIPTION_EDIT_WINDOW_HOURS - 1), ...at }) === null, "null");
  check(`completed ${PRESCRIPTION_EDIT_WINDOW_HOURS + 1}h ago → locked`, !!prescriptionEditProblem({ status: "COMPLETED", completedAt: hoursAgo(PRESCRIPTION_EDIT_WINDOW_HOURS + 1), ...at }), "locked");
  check("legacy completed (no completedAt), visit 2 days ago → locked", !!prescriptionEditProblem({ status: "COMPLETED", completedAt: null, scheduledAt: hoursAgo(48) }), "locked");
  for (const s of ["CANCELLED", "REJECTED", "EXPIRED", "NO_SHOW", "PENDING_APPROVAL"]) {
    check(`${s} → blocked`, !!prescriptionEditProblem({ status: s, completedAt: null, ...at }), "blocked");
  }

  // ── API ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `9${stamp}${n++}`, ...data } as never });
    ids.push(u.id);
    return u;
  };
  const doctorData = (name: string) => ({
    name, role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 24 * HOUR), qualification: "MBBS", medRegNo: `RX${stamp}${n}` } },
  });
  const doctor = await mk(doctorData("Rx Doctor"));
  const otherDoctor = await mk(doctorData("Rx Other Doctor"));
  const admin = await mk({ name: "Rx Admin", role: "ADMIN" });
  const patient = await mk({
    name: "Rx Parent", role: "PATIENT", termsAcceptedAt: new Date(),
    patientProfile: { create: { age: 40, gender: "Male", homeAddress: "12 Parent Lane, Pune" } },
  });
  const profile = await prisma.patientProfile.findUniqueOrThrow({ where: { userId: patient.id } });
  const child = await prisma.patientDependent.create({ data: { patientProfileId: profile.id, name: "Rx Child", relation: "Daughter", age: 5, gender: "Female" } });

  const appt = (status: string, extra: Record<string, unknown> = {}) =>
    prisma.appointment.create({
      data: { doctorId: doctor.id, patientId: patient.id, status, scheduledAt: hoursAgo(1), symptoms: "fever", amount: 500, consultType: "VIDEO", paymentMethod: "CASH", ...extra } as never,
    });
  const items = (id: string, medicines: unknown[], tests: unknown[] = []) =>
    call(doctor, "POST", `/api/appointments/${id}/prescription-items`, { medicines, tests });
  const versionsOf = (id: string) => prisma.prescriptionVersion.findMany({ where: { appointmentId: id }, orderBy: { version: "asc" } });
  const para = { name: "Paracetamol 500", dosage: "1 tab", frequency: "TDS", duration: "3 days" };
  const cetirizine = { name: "Cetirizine 10", dosage: "1 tab", frequency: "OD", duration: "5 days" };

  try {
    // ── Versions while accepted ──
    const a = await appt("SCHEDULED");
    let r = await items(a.id, [para], [{ name: "CBC" }]);
    check("write while accepted → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await items(a.id, [para], [{ name: "CBC" }]);
    check("unchanged re-save adds no version", (await versionsOf(a.id)).length === 1, `${(await versionsOf(a.id)).length} versions`);
    r = await items(a.id, [para, cetirizine], [{ name: "CBC" }]);
    const v = await versionsOf(a.id);
    check("a change adds version 2", v.length === 2 && v[1].version === 2 && (v[1].medicines as unknown[]).length === 2, `${v.length} versions`);
    check("version records the editing doctor", v.every((x) => x.editedById === doctor.id), "ok");

    // ── Completion opens the 24h window, then it locks ──
    r = await call(doctor, "PATCH", `/api/appointments/${a.id}`, { status: "COMPLETED", doctorNotes: "Rest and fluids" });
    const done = await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } });
    check("completing sets completedAt", r.status === 200 && !!done.completedAt && Date.now() - done.completedAt.getTime() < 60_000, `${r.status} ${done.completedAt?.toISOString()}`);
    r = await items(a.id, [cetirizine], [{ name: "CBC" }]);
    check("fix within the window → 200 + version 3", r.status === 200 && (await versionsOf(a.id)).length === 3, `${r.status} ${r.json.error ?? ""}`);
    await prisma.appointment.update({ where: { id: a.id }, data: { completedAt: hoursAgo(PRESCRIPTION_EDIT_WINDOW_HOURS + 1) } });
    r = await items(a.id, [para]);
    check("after the window → 409 PRESCRIPTION_LOCKED", r.status === 409 && r.json.code === "PRESCRIPTION_LOCKED", `${r.status} ${r.json.error}`);
    const kept = await prisma.prescriptionMedicine.findMany({ where: { appointmentId: a.id } });
    check("locked prescription unchanged", kept.length === 1 && kept[0].name === cetirizine.name && (await versionsOf(a.id)).length === 3, kept.map((m) => m.name).join(", "));

    // ── Blocked statuses ──
    for (const s of ["CANCELLED", "REJECTED"]) {
      const b = await appt(s);
      r = await items(b.id, [para]);
      check(`${s} consultation → 409`, r.status === 409 && r.json.code === "PRESCRIPTION_LOCKED", `${r.status} ${r.json.error}`);
    }
    const legacyDone = await appt("COMPLETED", { scheduledAt: hoursAgo(48) });
    r = await items(legacyDone.id, [para]);
    check("legacy completed (no completedAt) 2 days ago → 409", r.status === 409, `${r.status} ${r.json.error}`);

    // ── Prescription written before history existed ──
    const legacy = await appt("SCHEDULED", { medicines: { create: [{ ...para, instructions: null }] } });
    r = await items(legacy.id, [cetirizine]);
    const lv = await versionsOf(legacy.id);
    check("original saved as v1 before the first tracked edit", lv.length === 2 && (lv[0].medicines as { name: string }[])[0]?.name === para.name
      && (lv[1].medicines as { name: string }[])[0]?.name === cetirizine.name, `${lv.length} versions`);

    // ── Who sees the history ──
    r = await call(doctor, "GET", `/api/appointments/${a.id}/prescription-items`);
    const listed = (r.json.versions as { version: number }[] | undefined) ?? [];
    check("doctor reads version history, newest first", r.status === 200 && listed.length === 3 && listed[0].version === 3, `${r.status} ${listed.map((x) => x.version)}`);
    r = await call(admin, "GET", `/api/appointments/${a.id}/prescription-items`);
    check("admin reads version history", r.status === 200, `${r.status}`);
    r = await call(otherDoctor, "GET", `/api/appointments/${a.id}/prescription-items`);
    check("another doctor can't", r.status === 404, `${r.status}`);
    r = await call(patient, "GET", `/api/appointments/${a.id}/prescription-items`);
    check("patient can't (history is for the doctor/admin)", r.status === 403, `${r.status}`);

    // ── The issued document ──
    r = await call(patient, "GET", `/api/appointments/${a.id}/prescription`);
    check("self prescription: account holder's age/gender/address", r.status === 200 && r.json.patientAge === 40 && r.json.patientGender === "Male" && r.json.patientAddress === "12 Parent Lane, Pune",
      `${r.json.patientAge} ${r.json.patientGender} ${r.json.patientAddress}`);
    const forChild = await appt("COMPLETED", { dependentId: child.id, patientName: "Rx Child", relation: "Daughter", completedAt: new Date(), medicines: { create: [{ ...para, instructions: null }] } });
    r = await call(patient, "GET", `/api/appointments/${forChild.id}/prescription`);
    check("dependent prescription: the child's own age/gender, no parent address", r.status === 200 && r.json.patientAge === 5 && r.json.patientGender === "Female" && r.json.patientAddress === null && r.json.patientName === "Rx Child",
      `${r.json.patientName} ${r.json.patientAge} ${r.json.patientGender} ${r.json.patientAddress}`);
    r = await call(doctor, "GET", `/api/appointments/${forChild.id}/prescription`);
    check("doctor can view/print the prescription they issued", r.status === 200 && r.json.patientAge === 5, `${r.status} ${r.json.error ?? ""}`);
    r = await call(otherDoctor, "GET", `/api/appointments/${forChild.id}/prescription`);
    check("another doctor can't", r.status === 403, `${r.status}`);
    const open = await appt("SCHEDULED");
    r = await call(doctor, "GET", `/api/appointments/${open.id}/prescription`);
    check("doctor: not issued until completed → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(admin, "GET", `/api/appointments/${open.id}/prescription`);
    check("admin can view at any status", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
  } finally {
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
