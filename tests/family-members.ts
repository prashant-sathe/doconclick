// Family members (/patient/profile/family): a patient lists, adds, edits and
// deletes their saved dependents through /api/patients/me/dependents; GET one
// returns it with the vitals a delete would remove; the relation can now be
// changed on edit (never to "Self"); another patient's dependent is a 404
// everywhere; deleting keeps past appointments (dependentId cleared) and
// removes that dependent's vitals; the three screens open for a patient.
// Against a live dev server and the DB in .env, throwaway users only.
//
//   npm run test:family        (BASE_URL defaults to http://localhost:3000)
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

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { Cookie: cookieFor(as), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J & J[] };
}

async function main() {
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `8${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const patient = await mk({ name: "Family Patient", role: "PATIENT", patientProfile: { create: { age: 40, gender: "Male" } } });
  const other = await mk({ name: "Other Patient", role: "PATIENT", patientProfile: { create: { age: 35, gender: "Female" } } });
  const doctor = await mk({ name: "Family Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true } } });
  const base = "/api/patients/me/dependents";

  try {
    let r = await call(patient, "GET", base);
    check("new patient → empty list", r.status === 200 && Array.isArray(r.json) && r.json.length === 0, `${r.status} ${JSON.stringify(r.json)}`);

    // ── Add ──
    r = await call(patient, "POST", base, { relation: "Mother", name: "Asha Patil", age: "68", gender: "Female", bloodGroup: "B+", chronicDiseases: "Diabetes,Knee pain", emergencyContactPhone: "+91 98765 43210" });
    const mother = r.json as J & { id: string };
    check("add mother → 200 with fields parsed", r.status === 200 && mother.age === 68 && mother.relation === "Mother" && mother.chronicDiseases === "Diabetes,Knee pain" && mother.emergencyContactPhone === "9876543210", `${r.status} age ${mother.age} phone ${mother.emergencyContactPhone}`);
    r = await call(patient, "POST", base, { relation: "Son", name: "Rohan" });
    const son = r.json as J & { id: string };
    check("add son with only a name → 200", r.status === 200 && son.age === null, `${r.status}`);
    r = await call(patient, "POST", base, { name: "Rohan" });
    check("add without relation → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(patient, "POST", base, { relation: "Self", name: "Me Again" });
    check("relation Self → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(patient, "POST", base, { relation: "Son", name: "A" });
    check("one-letter name → 400", r.status === 400, `${r.status} ${r.json.error}`);

    r = await call(patient, "GET", base);
    check("list → both, newest first", r.json.length === 2 && (r.json[0] as J).id === son.id, `${r.json.length} items`);

    // ── Get one ──
    await prisma.vitalReading.createMany({ data: [1, 2].map(() => ({ patientId: patient.id, dependentId: mother.id, recordedById: patient.id, systolic: 130, diastolic: 85 })) });
    r = await call(patient, "GET", `${base}/${mother.id}`);
    check("GET one → the dependent + vitalsCount 2, no owner leak", r.status === 200 && r.json.name === "Asha Patil" && r.json.vitalsCount === 2 && !("patientProfile" in r.json), `${r.status} vitals ${r.json.vitalsCount}`);
    r = await call(other, "GET", `${base}/${mother.id}`);
    check("another patient GET → 404", r.status === 404, `${r.status}`);
    r = await call(doctor, "GET", `${base}/${mother.id}`);
    check("a doctor → 403", r.status === 403, `${r.status}`);

    // ── Edit ──
    r = await call(patient, "PATCH", `${base}/${son.id}`, { relation: "Daughter", name: "Riya", age: 12 });
    check("edit: relation Son → Daughter, name and age saved", r.status === 200 && r.json.relation === "Daughter" && r.json.name === "Riya" && r.json.age === 12, `${r.status} ${r.json.relation} ${r.json.name}`);
    r = await call(patient, "PATCH", `${base}/${son.id}`, { name: "Riya" });
    check("edit without relation keeps it (booking picker path)", r.status === 200 && r.json.relation === "Daughter" && r.json.age === null, `${r.json.relation}, age ${r.json.age} (full replace)`);
    r = await call(patient, "PATCH", `${base}/${son.id}`, { relation: "Self", name: "Riya" });
    check("edit to Self → 400", r.status === 400, `${r.status}`);
    r = await call(other, "PATCH", `${base}/${son.id}`, { name: "Hijack" });
    check("another patient PATCH → 404, unchanged", r.status === 404 && (await prisma.patientDependent.findUniqueOrThrow({ where: { id: son.id } })).name === "Riya", `${r.status}`);

    // ── Delete ──
    const appt = await prisma.appointment.create({
      data: { doctorId: doctor.id, patientId: patient.id, dependentId: mother.id, patientName: "Asha Patil", relation: "Mother", status: "COMPLETED", consultType: "CLINIC", symptoms: "FAMILY-TEST", amount: 300, scheduledAt: new Date() } as never,
    });
    r = await call(other, "DELETE", `${base}/${mother.id}`);
    check("another patient DELETE → 404", r.status === 404, `${r.status}`);
    r = await call(patient, "DELETE", `${base}/${mother.id}`);
    const kept = await prisma.appointment.findUnique({ where: { id: appt.id } });
    check("delete → 200; past appointment kept with its snapshot, link cleared", r.status === 200 && !!kept && kept.dependentId === null && kept.patientName === "Asha Patil", `${r.status} dependentId ${kept?.dependentId}`);
    check("…their vitals are gone", (await prisma.vitalReading.count({ where: { patientId: patient.id } })) === 0, "0 readings");
    r = await call(patient, "GET", `${base}/${mother.id}`);
    check("…GET it again → 404", r.status === 404, `${r.status}`);

    // ── Screens ──
    for (const path of ["/patient/profile/family", "/patient/profile/family/new", `/patient/profile/family/${son.id}`]) {
      const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookieFor(patient) }, redirect: "manual" });
      check(`${path} → 200`, res.status === 200, `${res.status}`);
    }
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.vitalReading.deleteMany({ where: { patientId: { in: ids } } });
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
