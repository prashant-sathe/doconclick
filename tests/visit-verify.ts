// Home-visit coordinates belong to the address (BUG-TRACKER #65): nurse and
// doctor home bookings check the travel radius against coordinates that
// match the visit address — the saved home address's saved coordinates, or
// where a new address geocodes to — and reject a pin that's far from the
// address (e.g. a Mumbai address sent with coordinates next to a Pune nurse).
// Saving the profile address applies the same check, since bookings trust
// it. Against a live dev server and the DB in .env (makes a few real,
// cached Nominatim lookups), throwaway users only.
//
//   npm run test:visit-verify
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { istDayKey, istStartOfDay, addDaysYmd } from "../src/lib/istDate";
import { haversine } from "../src/lib/geo";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// Real places: the nurse/doctor are in central Pune; Baner and Kothrud are
// ~8 km away (within the 10 km radius); Andheri is in Mumbai (~120 km).
const PUNE = { lat: 18.5204, lng: 73.8567 };
const BANER = { lat: 18.559, lng: 73.7868 };
const KOTHRUD = { lat: 18.5074, lng: 73.8077 };
const ANDHERI = { lat: 19.1136, lng: 72.8697 };

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string; id?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (role: string, extra: Record<string, unknown> = {}) => {
    const u = await prisma.user.create({ data: { name: `Verify ${role} ${++n}`, mobile: `6${stamp}${String(n).padStart(2, "0")}`, role, termsAcceptedAt: new Date(), ...extra } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const home = (extra: Record<string, unknown> = {}) => ({ create: { age: 30, gender: "Female", homeAddress: "Kothrud, Pune, Maharashtra", pinCode: "411038", ...KOTHRUD, ...extra } });
  // Each booking check is its own patient (booking POSTs are rate-limited per user).
  const patients = await Promise.all(Array.from({ length: 8 }, () => mk("PATIENT", { patientProfile: home() })));
  let next = 0;
  const pt = () => patients[next++];

  const nurse = await mk("NURSE", { nurseProfile: { create: { status: "APPROVED", ...PUNE, radius: 10, availability: "Sun-Sat, 12AM-11:59PM", registrationFeePaid: true, subscriptionPaidUntil: new Date(Date.now() + 30 * DAY) } } });
  const service = await prisma.nurseService.create({ data: { name: `Verify Service ${stamp}`, durationMinutes: 30 } });
  const np = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } });
  await prisma.nurseServiceOffering.create({ data: { nurseProfileId: np.id, serviceId: service.id, price: 500 } });
  const doctor = await mk("DOCTOR", { doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY), offersHomeVisit: true, homeVisitFee: 800, radius: 10, availability: "Sun-Sat, 12AM-11:59PM", ...PUNE } } });

  let hour = 0;
  const base = istStartOfDay(addDaysYmd(istDayKey(new Date()), 2)).getTime() + 10 * 60 * 60_000;
  const later = () => new Date(base + ++hour * 60 * 60_000).toISOString();
  const nurseBook = (as: U, extra: Record<string, unknown> = {}) => call(as, "POST", "/api/nurse-bookings", { nurseId: nurse.id, serviceId: service.id, consentGiven: true, scheduledAt: later(), ...extra });
  const docBook = (as: U, extra: Record<string, unknown> = {}) => call(as, "POST", "/api/appointments", { doctorId: doctor.id, symptoms: "fever", consultType: "HOME", consentGiven: true, scheduledAt: later(), ...extra });
  const row = (id: string | undefined) => prisma.appointment.findUnique({ where: { id: id ?? "" } });

  try {
    // ── Nurse bookings ──
    let r = await nurseBook(pt(), { visit: { address: "Andheri West, Mumbai, Maharashtra", pinCode: "400053", ...BANER } });
    check("LIVE case: a Mumbai address sent with coordinates in Pune → 409 LOCATION_MISMATCH", r.status === 409 && r.json.code === "LOCATION_MISMATCH", `${r.status} ${r.json.code} ${r.json.error}`);
    check("…and nothing was booked", (await prisma.appointment.count({ where: { doctorId: nurse.id } })) === 0, "ok");

    r = await nurseBook(pt(), { visit: { address: "Baner, Pune, Maharashtra", pinCode: "411045", ...BANER } });
    check("an honest new address (Baner, pinned in Baner) books", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    r = await nurseBook(pt(), { visit: { address: "Andheri West, Mumbai, Maharashtra", pinCode: "400053", ...ANDHERI } });
    check("an honest far address still meets the normal radius refusal (400, km away)", r.status === 400 && /travels within 10 km/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);

    r = await nurseBook(pt(), { visit: { address: "Qwzx Plmn Vbtr Flat 9", ...BANER } });
    check("an address that can't be found anywhere → 409 ADDRESS_NOT_FOUND", r.status === 409 && r.json.code === "ADDRESS_NOT_FOUND", `${r.status} ${r.json.code}`);

    // The saved home address: the saved coordinates are the reference.
    const shifted = { lat: KOTHRUD.lat + 0.045, lng: KOTHRUD.lng }; // ~5 km north
    r = await nurseBook(pt(), { visit: { address: "kothrud, pune,  Maharashtra", pinCode: "411038", ...shifted } });
    check("the saved home address with a pin 5 km off its saved point → 409 LOCATION_MISMATCH", r.status === 409 && r.json.code === "LOCATION_MISMATCH" && /saved home address/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    const close = { lat: KOTHRUD.lat + 0.004, lng: KOTHRUD.lng + 0.003 }; // ~0.5 km
    r = await nurseBook(pt(), { visit: { address: "Kothrud, Pune, Maharashtra", pinCode: "411038", ...close } });
    let booked = await row(r.json.id);
    check("…within 2 km → booked, with the saved coordinates (not the request's)", r.status === 200 && booked?.visitLat === KOTHRUD.lat && booked?.visitLng === KOTHRUD.lng, `${r.status} ${booked?.visitLat},${booked?.visitLng}`);
    r = await nurseBook(pt());
    booked = await row(r.json.id);
    check("no visit address sent → the saved profile address and coordinates, no lookup needed", r.status === 200 && booked?.visitLat === KOTHRUD.lat, `${r.status} ${r.json.error ?? ""}`);

    // ── Doctor home visits ──
    r = await docBook(pt(), { visit: { address: "Andheri West, Mumbai, Maharashtra", pinCode: "400053", ...BANER } });
    check("doctor home visit: the same spoof → 409 LOCATION_MISMATCH", r.status === 409 && r.json.code === "LOCATION_MISMATCH", `${r.status} ${r.json.code} ${r.json.error}`);
    // Saved address without coordinates + the phone's position next to the doctor.
    const noPin = await mk("PATIENT", { patientProfile: home({ homeAddress: "Andheri West, Mumbai, Maharashtra", pinCode: "400053", lat: null, lng: null }) });
    r = await docBook(noPin, { patientLat: BANER.lat, patientLng: BANER.lng });
    check("doctor: a Mumbai home address with the phone's Pune position → 409 (the phone fix isn't trusted blindly)", r.status === 409 && r.json.code === "LOCATION_MISMATCH", `${r.status} ${r.json.code} ${r.json.error}`);

    // ── Saving the profile address ──
    const editor = await mk("PATIENT", { patientProfile: home() });
    r = await call(editor, "PATCH", "/api/patients/me", { homeAddress: "Kothrud, Pune, Maharashtra", pinCode: "411038", ...ANDHERI });
    check("profile: a Pune address saved with Mumbai coordinates → 409", r.status === 409 && r.json.code === "LOCATION_MISMATCH", `${r.status} ${r.json.code}`);
    let saved = await prisma.patientProfile.findUniqueOrThrow({ where: { userId: editor.id } });
    check("…saved coordinates untouched", saved.lat === KOTHRUD.lat, String(saved.lat));
    r = await call(editor, "PATCH", "/api/patients/me", { homeAddress: "Baner, Pune, Maharashtra", pinCode: "411045", ...BANER });
    saved = await prisma.patientProfile.findUniqueOrThrow({ where: { userId: editor.id } });
    check("profile: Baner saved with Baner coordinates → 200", r.status === 200 && saved.lat === BANER.lat, `${r.status} ${saved.lat}`);
    r = await call(editor, "PATCH", "/api/patients/me", { homeAddress: "Andheri West, Mumbai, Maharashtra", pinCode: "400053" });
    saved = await prisma.patientProfile.findUniqueOrThrow({ where: { userId: editor.id } });
    check("profile: moving the address to Mumbai without a new pin clears the old Pune pin", r.status === 200 && saved.lat === null && saved.lng === null, `${r.status} ${saved.lat}`);
    await prisma.patientProfile.update({ where: { userId: editor.id }, data: { homeAddress: "Baner, Pune, Maharashtra", ...BANER } });
    r = await call(editor, "PATCH", "/api/patients/me", { homeAddress: "Aundh, Pune, Maharashtra", pinCode: "411007" });
    saved = await prisma.patientProfile.findUniqueOrThrow({ where: { userId: editor.id } });
    check("…but a nearby new address (Aundh, ~3 km from the Baner pin) keeps it", r.status === 200 && saved.lat === BANER.lat, `${r.status} ${saved.lat} (${haversine(BANER.lat, BANER.lng, 18.558, 73.8077).toFixed(1)} km)`);
    r = await call(editor, "PATCH", "/api/patients/me", { bloodGroup: "O+" });
    check("profile edits that don't touch the address don't look anything up", r.status === 200, `${r.status}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.nurseServiceOffering.deleteMany({ where: { serviceId: service.id } });
    await prisma.nurseService.delete({ where: { id: service.id } });
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
