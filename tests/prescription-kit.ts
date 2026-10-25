// Prescription productivity (FP1-8): the built-in medicine list, the advisory
// drug-allergy check, a doctor's own favourite medicines + templates (doctor
// only, never their staff or another doctor), and the prescription-context
// lookup (allergies + "repeat last") that follows the prescription lock and
// the patient-history rule. Pure checks, then API checks against its own dev
// server (BASE_URL to use a running one) and the DB in .env, throwaway users only.
//
//   npm run test:prescription-kit
import "dotenv/config";
import jwt from "jsonwebtoken";
import type { ChildProcess } from "child_process";
import { prisma } from "../src/lib/prisma";
import { allergyTerms, medicineAllergyMatches, medicineSuggestions, MEDICINE_SUGGESTIONS } from "../src/lib/medicineCatalog";
import { PRESCRIPTION_EDIT_WINDOW_HOURS } from "../src/lib/prescriptionLock";
import { startDevServer } from "./devServer";

let BASE = process.env.BASE_URL ?? "";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON bodies, checked field by field
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, any> & { error?: string; code?: string } };
}

function pureChecks() {
  check("built-in list has common generics", MEDICINE_SUGGESTIONS.length >= 100 && MEDICINE_SUGGESTIONS.includes("Paracetamol 500 mg"), `${MEDICINE_SUGGESTIONS.length} entries`);
  const s = medicineSuggestions(["Dolo 650", "paracetamol 500 mg"]);
  check("favourites come first, duplicates dropped", s[0] === "Dolo 650" && s[1] === "paracetamol 500 mg" && !s.includes("Paracetamol 500 mg"), s.slice(0, 3).join(" | "));

  const terms = allergyTerms("Penicillin, dust; Sulfa drugs", "none", "penicillin");
  check("allergy text split, 'none' and repeats dropped", terms.join("|") === "Penicillin|dust|Sulfa drugs", terms.join("|"));
  check("NKDA / nil → no allergies", allergyTerms("NKDA", "Nil", "No known allergies").length === 0, "[]");

  const cases: [string, string[], string[]][] = [
    ["Amoxicillin + Clavulanic acid 625 mg", ["Penicillin"], ["Penicillin"]],
    ["Augmentin 625", ["penicillin"], ["penicillin"]],
    ["Amoxicillin 500 mg", ["Augmentin"], ["Augmentin"]],
    ["Cotrimoxazole (Sulfamethoxazole + Trimethoprim) 800/160 mg", ["Sulfa drugs"], ["Sulfa drugs"]],
    ["Ibuprofen 400 mg", ["Aspirin"], ["Aspirin"]],
    ["Dolo 650", ["Paracetamol"], ["Paracetamol"]],
    ["Cefixime 200 mg", ["cephalosporins"], ["cephalosporins"]],
    ["Paracetamol 500 mg", ["Penicillin", "dust", "Sulfa drugs"], []],
    ["Paracetamol syrup 250 mg/5 ml", ["syrup allergy"], []],
    ["Azithromycin 500 mg", ["peanuts", "pollen"], []],
    ["Levofloxacin 500 mg", ["ciprofloxacin"], ["ciprofloxacin"]],
  ];
  for (const [med, allergies, want] of cases) {
    const got = medicineAllergyMatches(med, allergies);
    check(`allergy check: ${med} vs ${allergies.join(", ")}`, got.join("|") === want.join("|"), got.length ? `warns: ${got.join(", ")}` : "no warning");
  }
  check("blank medicine never warns", medicineAllergyMatches("  ", ["penicillin"]).length === 0, "[]");
}

async function main() {
  pureChecks();

  let child: ChildProcess | null = null;
  if (!BASE) {
    const started = await startDevServer({ label: "prescription-kit", env: {} });
    child = started.child;
    BASE = started.base;
  }

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
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 24 * HOUR), qualification: "MBBS", medRegNo: `KT${stamp}${n}` } },
  });

  try {
    const doctor = await mk(doctorData("Kit Doctor"));
    const other = await mk(doctorData("Kit Other Doctor"));
    const staff = await mk({ name: "Kit Desk", role: "STAFF", staffAccount: { create: { doctorId: doctor.id } } });
    const patient = await mk({
      name: "Kit Patient", role: "PATIENT", termsAcceptedAt: new Date(),
      patientProfile: { create: { age: 40, gender: "Male", allergies: "Penicillin, dust" } },
    });
    const profile = await prisma.patientProfile.findUniqueOrThrow({ where: { userId: patient.id } });
    const child1 = await prisma.patientDependent.create({ data: { patientProfileId: profile.id, name: "Kit Child", relation: "Son", age: 6, allergies: "Sulfa" } });
    const appt = (status: string, extra: Record<string, unknown> = {}) =>
      prisma.appointment.create({
        data: { doctorId: doctor.id, patientId: patient.id, status, scheduledAt: hoursAgo(1), symptoms: "fever", amount: 500, consultType: "VIDEO", paymentMethod: "CASH", ...extra } as never,
      });

    // ── Favourites ──
    let r = await call(doctor, "POST", "/api/doctor/prescription-favourites", { name: "Dolo 650", dosage: "1 tab", frequency: "Thrice daily", duration: "3 days" });
    check("doctor saves a favourite → 201", r.status === 201 && r.json.favourite?.name === "Dolo 650", `${r.status} ${r.json.error ?? ""}`);
    const favId = r.json.favourite?.id as string;
    r = await call(doctor, "POST", "/api/doctor/prescription-favourites", { name: "  dolo 650 ", dosage: "2 tab", frequency: "Twice daily", duration: "5 days" });
    const favs = await prisma.doctorFavouriteMedicine.findMany({ where: { doctorId: doctor.id } });
    check("same name again updates it (no duplicate)", r.status === 200 && favs.length === 1 && favs[0].dosage === "2 tab", `${r.status} ${favs.length} rows, dosage ${favs[0]?.dosage}`);
    r = await call(doctor, "POST", "/api/doctor/prescription-favourites", { name: "   " });
    check("favourite without a name → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(doctor, "GET", "/api/doctor/prescription-favourites");
    check("doctor lists own favourites", r.status === 200 && r.json.favourites?.length === 1, `${r.status} ${r.json.favourites?.length}`);
    r = await call(other, "GET", "/api/doctor/prescription-favourites");
    check("another doctor sees none of them", r.status === 200 && r.json.favourites?.length === 0, `${r.json.favourites?.length}`);
    r = await call(staff, "GET", "/api/doctor/prescription-favourites");
    check("staff can't read favourites → 403", r.status === 403, `${r.status}`);
    r = await call(staff, "POST", "/api/doctor/prescription-favourites", { name: "X" });
    check("staff can't save favourites → 403", r.status === 403, `${r.status}`);
    r = await call(patient, "GET", "/api/doctor/prescription-favourites");
    check("patient → 403", r.status === 403, `${r.status}`);
    r = await call(other, "DELETE", `/api/doctor/prescription-favourites/${favId}`);
    check("another doctor can't delete it → 404", r.status === 404 && (await prisma.doctorFavouriteMedicine.count({ where: { id: favId } })) === 1, `${r.status}`);
    r = await call(doctor, "DELETE", `/api/doctor/prescription-favourites/${favId}`);
    check("owner deletes it", r.status === 200 && (await prisma.doctorFavouriteMedicine.count({ where: { id: favId } })) === 0, `${r.status}`);

    // ── Limit holds under parallel saves (advisory lock) ──
    await prisma.doctorFavouriteMedicine.createMany({ data: Array.from({ length: 199 }, (_, i) => ({ doctorId: doctor.id, name: `Bulk ${i}`, nameKey: `bulk ${i}` })) });
    const burst = await Promise.all([0, 1, 2, 3].map((i) => call(doctor, "POST", "/api/doctor/prescription-favourites", { name: `Race ${i}` })));
    const created = burst.filter((x) => x.status === 201).length;
    const full = burst.filter((x) => x.status === 409 && x.json.code === "FAVOURITES_FULL").length;
    const total = await prisma.doctorFavouriteMedicine.count({ where: { doctorId: doctor.id } });
    check("4 parallel saves at 199/200 → exactly 1 created, 3 × 409", created === 1 && full === 3 && total === 200, `${burst.map((x) => x.status).join(",")} → ${total} rows`);
    r = await call(doctor, "POST", "/api/doctor/prescription-favourites", { name: "Bulk 5", dosage: "2 tab" });
    check("at the limit, updating an existing favourite still works", r.status === 200, `${r.status}`);
    await prisma.doctorFavouriteMedicine.deleteMany({ where: { doctorId: doctor.id } });

    // ── Templates ──
    const tpl = { name: "Viral fever", medicines: [{ name: "Paracetamol 650 mg", dosage: "1 tab", frequency: "Thrice daily", duration: "3 days" }], tests: [{ name: "CBC" }] };
    r = await call(doctor, "POST", "/api/doctor/prescription-templates", tpl);
    check("doctor saves a template → 201", r.status === 201 && r.json.template?.medicines?.length === 1 && r.json.template?.tests?.length === 1, `${r.status} ${r.json.error ?? ""}`);
    const tplId = r.json.template?.id as string;
    r = await call(doctor, "POST", "/api/doctor/prescription-templates", { ...tpl, name: "VIRAL FEVER", tests: [] });
    const tpls = await prisma.prescriptionTemplate.findMany({ where: { doctorId: doctor.id } });
    check("same name (any case) replaces it", r.status === 200 && tpls.length === 1 && (tpls[0].tests as unknown[]).length === 0, `${r.status} ${tpls.length} rows`);
    r = await call(doctor, "POST", "/api/doctor/prescription-templates", { name: "Empty", medicines: [{ name: "" }], tests: [] });
    check("empty template → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(doctor, "POST", "/api/doctor/prescription-templates", { name: "", medicines: tpl.medicines });
    check("template without a name → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(doctor, "POST", "/api/doctor/prescription-templates", { name: "x".repeat(61), medicines: tpl.medicines });
    check("over-long name → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(doctor, "POST", "/api/doctor/prescription-templates", { name: "Big", medicines: Array.from({ length: 51 }, (_, i) => ({ name: `M${i}` })) });
    check("more than 50 medicines → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(other, "GET", "/api/doctor/prescription-templates");
    check("another doctor sees none", r.status === 200 && r.json.templates?.length === 0, `${r.json.templates?.length}`);
    r = await call(staff, "GET", "/api/doctor/prescription-templates");
    check("staff can't read templates → 403", r.status === 403, `${r.status}`);
    r = await call(other, "DELETE", `/api/doctor/prescription-templates/${tplId}`);
    check("another doctor can't delete it → 404", r.status === 404 && (await prisma.prescriptionTemplate.count({ where: { id: tplId } })) === 1, `${r.status}`);
    await prisma.doctorProfile.update({ where: { userId: doctor.id }, data: { status: "SUSPENDED" } });
    r = await call(doctor, "POST", "/api/doctor/prescription-templates", tpl);
    check("suspended doctor can't save → 403", r.status === 403, `${r.status}`);
    await prisma.doctorProfile.update({ where: { userId: doctor.id }, data: { status: "APPROVED" } });
    r = await call(doctor, "DELETE", `/api/doctor/prescription-templates/${tplId}`);
    check("owner deletes it", r.status === 200 && (await prisma.prescriptionTemplate.count({ where: { id: tplId } })) === 0, `${r.status}`);

    // ── Prescription context: allergies + repeat last ──
    const para = { name: "Paracetamol 500", dosage: "1 tab", frequency: "Thrice daily", duration: "3 days", instructions: null };
    await appt("COMPLETED", { scheduledAt: hoursAgo(72), completedAt: hoursAgo(71), medicines: { create: [{ ...para, name: "Older Rx" }] } });
    const lastSelf = await appt("COMPLETED", { scheduledAt: hoursAgo(48), completedAt: hoursAgo(47), medicines: { create: [para] }, tests: { create: [{ name: "CBC" }] } });
    await appt("COMPLETED", { scheduledAt: hoursAgo(30), completedAt: hoursAgo(29), dependentId: child1.id, patientName: "Kit Child", relation: "Son", medicines: { create: [{ ...para, name: "Child Rx" }] } });
    await prisma.appointment.create({ data: { doctorId: other.id, patientId: patient.id, status: "COMPLETED", scheduledAt: hoursAgo(10), completedAt: hoursAgo(9), symptoms: "x", amount: 1, consultType: "VIDEO", paymentMethod: "CASH", medicines: { create: [{ ...para, name: "Other doctor Rx" }] } } as never });
    const current = await appt("SCHEDULED", { allergies: "Aspirin" });

    r = await call(doctor, "GET", `/api/appointments/${current.id}/prescription-context`);
    check("context: booking + profile allergies", r.status === 200 && (r.json.allergies as string[])?.join("|") === "Aspirin|Penicillin|dust", `${r.status} ${JSON.stringify(r.json.allergies)} ${r.json.error ?? ""}`);
    check("context: this doctor's latest prescription for the account holder", r.json.lastPrescription?.appointmentId === lastSelf.id
      && r.json.lastPrescription?.medicines?.[0]?.name === para.name && r.json.lastPrescription?.tests?.[0]?.name === "CBC", `${r.json.lastPrescription?.medicines?.[0]?.name}`);

    const forChild = await appt("SCHEDULED", { dependentId: child1.id, patientName: "Kit Child", relation: "Son" });
    r = await call(doctor, "GET", `/api/appointments/${forChild.id}/prescription-context`);
    check("family member: their own allergies and last Rx only", r.status === 200 && (r.json.allergies as string[])?.join("|") === "Sulfa" && r.json.lastPrescription?.medicines?.[0]?.name === "Child Rx",
      `${JSON.stringify(r.json.allergies)} ${r.json.lastPrescription?.medicines?.[0]?.name}`);

    r = await call(other, "GET", `/api/appointments/${current.id}/prescription-context`);
    check("another doctor → 404", r.status === 404, `${r.status}`);
    r = await call(staff, "GET", `/api/appointments/${current.id}/prescription-context`);
    check("staff → 403", r.status === 403, `${r.status}`);
    r = await call(patient, "GET", `/api/appointments/${current.id}/prescription-context`);
    check("patient → 403", r.status === 403, `${r.status}`);

    const lockedOne = await appt("COMPLETED", { completedAt: hoursAgo(PRESCRIPTION_EDIT_WINDOW_HOURS + 1) });
    r = await call(doctor, "GET", `/api/appointments/${lockedOne.id}/prescription-context`);
    check("locked prescription → 409 PRESCRIPTION_LOCKED", r.status === 409 && r.json.code === "PRESCRIPTION_LOCKED", `${r.status} ${r.json.code}`);
    const cancelled = await appt("CANCELLED");
    r = await call(doctor, "GET", `/api/appointments/${cancelled.id}/prescription-context`);
    check("cancelled visit → 409", r.status === 409, `${r.status}`);

    // A desk-booked walk-in for a stranger opens neither profile nor history.
    const stranger = await mk({ name: "Kit Stranger", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Female", allergies: "Penicillin" } } });
    await prisma.appointment.create({ data: { doctorId: doctor.id, patientId: stranger.id, status: "COMPLETED", scheduledAt: hoursAgo(50), completedAt: hoursAgo(49), bookedById: doctor.id, symptoms: "x", amount: 1, consultType: "CLINIC", paymentMethod: "CASH", medicines: { create: [para] } } as never });
    const walkIn = await prisma.appointment.create({ data: { doctorId: doctor.id, patientId: stranger.id, status: "SCHEDULED", scheduledAt: hoursAgo(1), bookedById: doctor.id, allergies: "Ibuprofen", symptoms: "x", amount: 1, consultType: "CLINIC", paymentMethod: "CASH" } as never });
    r = await call(doctor, "GET", `/api/appointments/${walkIn.id}/prescription-context`);
    check("walk-in: only the allergies given at booking, no profile, no history", r.status === 200 && (r.json.allergies as string[])?.join("|") === "Ibuprofen" && r.json.lastPrescription === null,
      `${r.status} ${JSON.stringify(r.json.allergies)} ${JSON.stringify(r.json.lastPrescription)}`);

    // No allergy data anywhere → nothing to warn about.
    const plain = await mk({ name: "Kit Plain", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Female" } } });
    const plainAppt = await prisma.appointment.create({ data: { doctorId: doctor.id, patientId: plain.id, status: "SCHEDULED", scheduledAt: hoursAgo(1), symptoms: "x", amount: 1, consultType: "VIDEO", paymentMethod: "CASH" } as never });
    r = await call(doctor, "GET", `/api/appointments/${plainAppt.id}/prescription-context`);
    check("no allergies on record → empty list, no last Rx", r.status === 200 && (r.json.allergies as string[])?.length === 0 && r.json.lastPrescription === null, `${JSON.stringify(r.json)}`);

    // Account deletion of the doctor removes their shortcuts (cascade).
    await call(doctor, "POST", "/api/doctor/prescription-favourites", { name: "Cetirizine 10 mg" });
    check("favourites belong to the doctor row", (await prisma.doctorFavouriteMedicine.count({ where: { doctorId: doctor.id } })) === 1, "1 row");
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    child?.kill("SIGTERM");
  }

  check("cleanup removed shortcuts with the doctor", (await prisma.doctorFavouriteMedicine.count({ where: { doctorId: { in: ids } } })) === 0, "0 rows");
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
