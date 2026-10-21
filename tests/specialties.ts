// Specialties (BUG-TRACKER #49): renaming one carries the new name to the
// doctors who have it (and to a pending re-verification request), names are
// unique ignoring case (routes + a lower(name) database index), colours must
// be real hex values, and the listing/profile code compares names ignoring
// case. Against a live dev server and the DB in .env, throwaway rows only.
//
//   npm run test:specialties
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
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
type Json = Record<string, unknown> & { error?: string; id?: string; name?: string; color?: string; doctorsUpdated?: number; changeRequest?: unknown };
async function call(as: U, method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const base = `Zz${stamp}`;
  const ids: string[] = [];
  const specialtyIds: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `7${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const admin = await mk({ name: "Spec Admin", role: "ADMIN" });
  const patient = await mk({ name: "Spec Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const profile = (specialty: string, extra: Record<string, unknown> = {}) => ({
    create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 864e5), specialty, ...extra },
  });
  const create = async (name: string, color?: string) => {
    const r = await call(admin, "POST", "/api/admin/specialties", { name, ...(color === undefined ? {} : { color }) });
    if (r.json.id) specialtyIds.push(r.json.id);
    return r;
  };

  try {
    // ── Colours ──
    for (const [label, color] of [["a colour name", "red"], ["5 digits", "#12345"], ["non-hex digits", "#gggggg"], ["no #", "2563eb"], ["a number", 123], ["3-digit shorthand", "#fff"]] as const) {
      const r = await call(admin, "POST", "/api/admin/specialties", { name: `${base} bad`, color });
      check(`create with ${label} colour → 400`, r.status === 400 && (r.json.error ?? "").includes("hex"), `${r.status} ${r.json.error}`);
    }
    check("…none of those was created", (await prisma.specialty.count({ where: { name: { startsWith: base } } })) === 0, "ok");
    let r = await create(`${base} Alpha`, "#ABCDEF");
    check("a valid colour is stored lowercase", r.status === 200 && r.json.color === "#abcdef", `${r.status} ${r.json.color}`);
    const alphaId = String(r.json.id);
    r = await create(`  ${base}   Beta  `);
    check("blank colour → the default; name trimmed and single-spaced", r.status === 200 && r.json.color === "#2563eb" && r.json.name === `${base} Beta`, `${r.json.name} / ${r.json.color}`);
    const betaId = String(r.json.id);
    r = await call(admin, "PATCH", `/api/admin/specialties/${alphaId}`, { color: "blue" });
    check("PATCH with a bad colour → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(admin, "PATCH", `/api/admin/specialties/${alphaId}`, { color: "#00FF00" });
    check("PATCH with a good colour → 200, lowercase", r.status === 200 && r.json.color === "#00ff00", `${r.status} ${r.json.color}`);

    // ── Names ──
    for (const [label, name] of [["blank", "   "], ["not a string", 42], ["too long", "x".repeat(61)]] as const) {
      r = await call(admin, "POST", "/api/admin/specialties", { name });
      check(`${label} name → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    r = await call(admin, "POST", "/api/admin/specialties", "{not json");
    check("malformed JSON → 400", r.status === 400, `${r.status}`);

    // ── Unique ignoring case ──
    r = await create(`${base.toLowerCase()} alpha`);
    check("create 'alpha' when 'Alpha' exists → 409", r.status === 409, `${r.status} ${r.json.error}`);
    r = await create(`${base.toUpperCase()} ALPHA`);
    check("…in any case → 409", r.status === 409, `${r.status}`);
    r = await call(admin, "PATCH", `/api/admin/specialties/${betaId}`, { name: `${base} ALPHA` });
    check("rename Beta to 'ALPHA' → 409", r.status === 409, `${r.status} ${r.json.error}`);
    let dbRejected = false;
    try { await prisma.specialty.create({ data: { name: `${base.toLowerCase()} alpha` } }); } catch { dbRejected = true; }
    check("the database refuses it too (lower(name) unique index)", dbRejected, dbRejected ? "rejected" : "created!");
    r = await call(admin, "PATCH", "/api/admin/specialties/no-such-id", { name: "Whatever" });
    check("PATCH unknown id → 404", r.status === 404, `${r.status}`);

    // ── Rename cascades to doctors ──
    const d1 = await mk({ name: "Spec Doctor 1", role: "DOCTOR", doctorProfile: profile(`${base} Alpha`) });
    const d2 = await mk({ name: "Spec Doctor 2", role: "DOCTOR", doctorProfile: profile(`${base} Alpha`) });
    const other = await mk({ name: "Spec Doctor Other", role: "DOCTOR", doctorProfile: profile("General Physician") });
    // d2 has a pending re-verification asking for this specialty; `other` one asking for something else.
    await prisma.doctorChangeRequest.create({ data: { doctorId: d2.id, status: "PENDING", changes: { specialty: { from: "General Physician", to: `${base} Alpha` }, qualification: { from: "MBBS", to: "MD" } } } });
    await prisma.doctorChangeRequest.create({ data: { doctorId: other.id, status: "PENDING", changes: { specialty: { from: "General Physician", to: "Dentist" } } } });

    r = await call(admin, "PATCH", `/api/admin/specialties/${alphaId}`, { name: `${base} Gamma` });
    check("rename → 200 and reports 2 doctors updated", r.status === 200 && r.json.doctorsUpdated === 2, `${r.status} ${r.json.doctorsUpdated}`);
    const after = await prisma.doctorProfile.findMany({ where: { userId: { in: [d1.id, d2.id, other.id] } }, select: { userId: true, specialty: true } });
    const specOf = (id: string) => after.find((a) => a.userId === id)?.specialty;
    check("both doctors now carry the new name; an unrelated doctor is untouched", specOf(d1.id) === `${base} Gamma` && specOf(d2.id) === `${base} Gamma` && specOf(other.id) === "General Physician", `${specOf(d1.id)} / ${specOf(d2.id)} / ${specOf(other.id)}`);
    const cr = await prisma.doctorChangeRequest.findFirstOrThrow({ where: { doctorId: d2.id } });
    const crChanges = cr.changes as { specialty: { from: string; to: string }; qualification: { to: string } };
    check("a pending request asking for the old name now asks for the new one (other fields kept)", crChanges.specialty.to === `${base} Gamma` && crChanges.specialty.from === "General Physician" && crChanges.qualification.to === "MD", JSON.stringify(crChanges));
    const crOther = await prisma.doctorChangeRequest.findFirstOrThrow({ where: { doctorId: other.id } });
    check("an unrelated pending request is untouched", (crOther.changes as { specialty: { to: string } }).specialty.to === "Dentist", "ok");

    // Rename that only changes case.
    r = await call(admin, "PATCH", `/api/admin/specialties/${alphaId}`, { name: `${base.toLowerCase()} gamma` });
    const caseOnly = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: d1.id } });
    check("a case-only rename is allowed and carries over", r.status === 200 && caseOnly.specialty === `${base.toLowerCase()} gamma`, `${r.status} ${caseOnly.specialty}`);
    await call(admin, "PATCH", `/api/admin/specialties/${alphaId}`, { name: `${base} Gamma` });

    // ── Listing and profile compare ignoring case ──
    const listed = await call(patient, "GET", `/api/doctors?specialty=${encodeURIComponent(`${base.toLowerCase()} GAMMA`)}`);
    const listedIds = Array.isArray(listed.json) ? (listed.json as unknown as { id: string }[]).map((d) => d.id) : [];
    check("the patient listing finds doctors whatever case the filter is in", listedIds.includes(d1.id) && listedIds.includes(d2.id) && !listedIds.includes(other.id), `${listedIds.length} found`);

    r = await call(d1, "PATCH", "/api/doctors/me", { specialty: `${base.toLowerCase()} gamma` });
    const kept = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: d1.id } });
    check("a verified doctor saving the name in another case → no change request, stored spelling kept", r.status === 200 && r.json.changeRequest === null && kept.specialty === `${base} Gamma`, `${r.status} cr=${JSON.stringify(r.json.changeRequest)} ${kept.specialty}`);
    const fresh = await mk({ name: "Spec Doctor New", role: "DOCTOR", doctorProfile: profile("General Physician", { isVerified: false, status: "PENDING" }) });
    r = await call(fresh, "PATCH", "/api/doctors/me", { specialty: `${base.toUpperCase()} GAMMA` });
    const stored = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: fresh.id } });
    check("an unverified doctor's entry is stored in the canonical spelling", r.status === 200 && stored.specialty === `${base} Gamma`, `${r.status} ${stored.specialty}`);

    // ── Delete is blocked while in use (ignoring case) ──
    r = await call(admin, "DELETE", `/api/admin/specialties/${alphaId}`);
    check("delete while doctors have it → 409", r.status === 409 && (r.json.error ?? "").includes("In use"), `${r.status} ${r.json.error}`);
    await prisma.doctorProfile.updateMany({ where: { userId: { in: [d1.id, d2.id, fresh.id] } }, data: { specialty: "General Physician" } });
    r = await call(admin, "DELETE", `/api/admin/specialties/${alphaId}`);
    check("…and allowed once nobody has it", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(admin, "DELETE", `/api/admin/specialties/${alphaId}`);
    check("deleting it again → 404", r.status === 404, `${r.status}`);
    r = await call(patient, "POST", "/api/admin/specialties", { name: `${base} Nope` });
    check("a patient can't manage specialties (403)", r.status === 403, `${r.status}`);
  } finally {
    await prisma.doctorChangeRequest.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.specialty.deleteMany({ where: { OR: [{ id: { in: specialtyIds } }, { name: { startsWith: base, mode: "insensitive" } }] } });
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
