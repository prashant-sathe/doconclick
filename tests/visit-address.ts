// Visit address snapshot (BUG-TRACKER #20): nurse bookings and doctor HOME
// bookings copy the visit address (address, landmark, PIN, lat/lng) onto the
// Appointment, so a later profile edit never moves a booked visit; the nurse
// travel radius is checked against that address, not the phone's position;
// dashboards read the snapshot (profile only for older rows); reassignment
// carries it over. Runs against a live dev server and the DB in .env, using
// only throwaway users/services that are removed afterwards.
//
//   npm run test:visit-address
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 24 * 60 * 60 * 1000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// Pune-ish points: HOME_A and NEAR are ~1 km apart; FAR is ~150 km away (Mumbai).
const HOME_A = { lat: 18.5204, lng: 73.8567 };
const NEAR = { lat: 18.5300, lng: 73.8600 };
const FAR = { lat: 19.0760, lng: 72.8777 };

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (role: string, extra: Record<string, unknown> = {}) => {
    const u = await prisma.user.create({ data: { name: `Visit ${role} ${++n}`, mobile: `4${stamp}${String(n).padStart(2, "0")}`, role, ...extra } as never });
    ids.push(u.id);
    return u;
  };
  const cookieFor = (u: { id: string; name: string; role: string; mobile: string }) =>
    `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
  const call = async (as: { id: string; name: string; role: string; mobile: string }, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookieFor(as), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  const profile = (extra: Record<string, unknown> = {}) => ({
    create: { age: 30, gender: "Female", homeAddress: "12 Old Lane, Pune", landmark: "Near Temple", pinCode: "411001", ...HOME_A, ...extra },
  });
  const patient = await mk("PATIENT", { patientProfile: profile() });
  const noCoords = await mk("PATIENT", { patientProfile: profile({ lat: null, lng: null }) });
  const nurse = await mk("NURSE", {
    nurseProfile: {
      create: {
        status: "APPROVED", ...HOME_A, radius: 10, availability: "",
        registrationFeePaid: true, subscriptionPaidUntil: new Date(Date.now() + 30 * DAY),
      },
    },
  });
  const service = await prisma.nurseService.create({ data: { name: `Visit Test Service ${stamp}`, durationMinutes: 30 } });
  const nurseProfile = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } });
  await prisma.nurseServiceOffering.create({ data: { nurseProfileId: nurseProfile.id, serviceId: service.id, price: 500 } });

  const specialty = `VisitTest ${stamp}`;
  const docProfile = (extra: Record<string, unknown> = {}) => ({
    create: {
      status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY), specialty,
      offersHomeVisit: true, homeVisitFee: 800, radius: 10, availability: "", ...HOME_A, ...extra,
    },
  });
  const doctor = await mk("DOCTOR", { doctorProfile: docProfile() });

  let minute = 0;
  const later = () => new Date(Date.now() + 2 * DAY + ++minute * 60 * 60_000).toISOString();
  const nurseBook = (as = patient, extra: Record<string, unknown> = {}) =>
    call(as, "POST", "/api/nurse-bookings", { nurseId: nurse.id, serviceId: service.id, consentGiven: true, scheduledAt: later(), ...extra });
  const visitB = { address: "Flat 5, New Tower, Baner, Pune", landmark: "Opp. Park", pinCode: "411045", ...NEAR };

  try {
    // ── Nurse bookings ──
    let r = await nurseBook(patient, { visit: visitB });
    const booked = await prisma.appointment.findUnique({ where: { id: r.json.id ?? "" } });
    check("nurse booking snapshots the visit address", r.status === 200 && booked?.visitAddress === visitB.address
      && booked.visitLandmark === "Opp. Park" && booked.visitPinCode === "411045" && booked.visitLat === NEAR.lat && booked.visitLng === NEAR.lng,
      `${r.status} ${booked?.visitAddress}`);

    await prisma.patientProfile.update({ where: { userId: patient.id }, data: { homeAddress: "99 Moved Away Rd", lat: FAR.lat, lng: FAR.lng } });
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: booked!.id } });
    check("profile edit doesn't move the booked visit", after.visitAddress === visitB.address && after.visitLat === NEAR.lat, after.visitAddress ?? "null");
    const nurseView = (await call(nurse, "GET", "/api/appointments/me")).json as { id: string; visit: { address: string; lat: number; snapshot: boolean } | null }[];
    const nv = nurseView.find((a) => a.id === booked!.id);
    check("nurse dashboard gets the snapshot, not the profile", nv?.visit?.address === visitB.address && nv.visit.lat === NEAR.lat && nv.visit.snapshot === true,
      `${nv?.visit?.address}`);

    r = await nurseBook(patient, { visit: { address: "Somewhere I typed" } });
    check("typed address without coordinates rejected", r.status === 400 && r.json.code === "LOCATION_REQUIRED", `${r.status} ${r.json.error}`);
    r = await nurseBook(patient, { visit: { ...visitB, pinCode: "41100" } });
    check("bad PIN rejected", r.status === 400, `${r.status} ${r.json.error}`);
    r = await nurseBook(patient, { visit: { ...visitB, lat: 123 } });
    check("out-of-range latitude rejected", r.status === 400, `${r.status}`);

    // The phone being nearby doesn't help a far-away visit address.
    r = await nurseBook(patient, { visit: { address: "Far flat, Mumbai", ...FAR }, patientLat: NEAR.lat, patientLng: NEAR.lng });
    check("radius checked against the visit address, not patientLat", r.status === 400 && /travels within/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);

    // No visit sent: the saved profile address (now the far one) is used.
    r = await nurseBook(patient);
    check("no visit → profile address, radius applies", r.status === 400 && /travels within/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    await prisma.patientProfile.update({ where: { userId: patient.id }, data: { homeAddress: "12 Old Lane, Pune", ...HOME_A } });
    r = await nurseBook(patient);
    const fromProfile = await prisma.appointment.findUnique({ where: { id: r.json.id ?? "" } });
    check("no visit → profile address snapshotted", r.status === 200 && fromProfile?.visitAddress === "12 Old Lane, Pune"
      && fromProfile.visitLandmark === "Near Temple" && fromProfile.visitPinCode === "411001" && fromProfile.visitLat === HOME_A.lat,
      `${r.status} ${fromProfile?.visitAddress}`);
    r = await nurseBook(noCoords, { patientLat: NEAR.lat, patientLng: NEAR.lng });
    check("profile without coordinates → LOCATION_REQUIRED (phone position not trusted)", r.status === 409 && r.json.code === "LOCATION_REQUIRED", `${r.status}`);

    r = await nurseBook(patient, { visit: visitB, visits: 3, intervalDays: 1 });
    const pkgRows = await prisma.appointment.findMany({ where: { packageId: r.json.packageId ?? "none" } });
    check("every visit in a package gets the snapshot", r.status === 200 && pkgRows.length === 3 && pkgRows.every((a) => a.visitAddress === visitB.address && a.visitLat === NEAR.lat),
      `${r.status} ${pkgRows.length} rows`);

    // ── Doctor HOME bookings ──
    const docBook = (as: typeof patient, extra: Record<string, unknown> = {}) =>
      call(as, "POST", "/api/appointments", { doctorId: doctor.id, symptoms: "fever", consultType: "HOME", consentGiven: true, scheduledAt: later(), ...extra });
    r = await docBook(patient, { patientLat: NEAR.lat, patientLng: NEAR.lng });
    const dh = await prisma.appointment.findUnique({ where: { id: r.json.id ?? "" } });
    check("doctor HOME snapshots the profile address with its own coordinates", r.status === 200 && dh?.visitAddress === "12 Old Lane, Pune"
      && dh.visitLat === HOME_A.lat && dh.visitPinCode === "411001", `${r.status} ${dh?.visitAddress} @ ${dh?.visitLat}`);
    r = await docBook(noCoords, { patientLat: NEAR.lat, patientLng: NEAR.lng });
    const dn = await prisma.appointment.findUnique({ where: { id: r.json.id ?? "" } });
    check("profile without coordinates → phone position as the coordinates", r.status === 200 && dn?.visitAddress === "12 Old Lane, Pune" && dn.visitLat === NEAR.lat,
      `${r.status} ${dn?.visitLat}`);
    r = await docBook(patient, { visit: visitB });
    const dv = await prisma.appointment.findUnique({ where: { id: r.json.id ?? "" } });
    check("doctor HOME accepts an explicit visit address", r.status === 200 && dv?.visitAddress === visitB.address && dv.visitLat === NEAR.lat, `${r.status}`);
    r = await docBook(patient, { visit: { address: "Far flat, Mumbai", ...FAR } });
    check("doctor radius checked against the visit address", r.status === 400 && /within 10 km/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    r = await docBook(patient, { visit: { address: "typed only" } });
    check("doctor HOME rejects a typed address without coordinates", r.status === 400 && r.json.code === "LOCATION_REQUIRED", `${r.status}`);

    // Legacy row (booked before snapshots): dashboard falls back to the profile.
    const legacy = await prisma.appointment.create({
      data: { patientId: patient.id, doctorId: doctor.id, symptoms: "old", consultType: "HOME", amount: 800, status: "SCHEDULED", scheduledAt: new Date(later()) },
    });
    const video = await prisma.appointment.create({
      data: { patientId: patient.id, doctorId: doctor.id, symptoms: "v", consultType: "VIDEO", amount: 300, status: "SCHEDULED", scheduledAt: new Date(later()) },
    });
    await prisma.patientProfile.update({ where: { userId: patient.id }, data: { homeAddress: "99 Moved Away Rd", lat: FAR.lat, lng: FAR.lng } });
    const docView = (await call(doctor, "GET", "/api/appointments/me")).json as { id: string; visit: { address: string; lat: number; snapshot: boolean } | null }[];
    const byId = Object.fromEntries(docView.map((a) => [a.id, a.visit]));
    check("doctor dashboard: snapshot for new bookings", byId[dh!.id]?.address === "12 Old Lane, Pune" && byId[dh!.id]?.lat === HOME_A.lat && byId[dh!.id]?.snapshot === true,
      `${byId[dh!.id]?.address}`);
    check("doctor dashboard: legacy row falls back to the profile", byId[legacy.id]?.address === "99 Moved Away Rd" && byId[legacy.id]?.snapshot === false,
      `${byId[legacy.id]?.address}`);
    check("doctor dashboard: no visit for video", byId[video.id] === null, `${JSON.stringify(byId[video.id])}`);

    // ── Reassignment carries the snapshot and matches on it ──
    // Candidate is near the booked address but far from the (moved) profile.
    const candidate = await mk("DOCTOR", { doctorProfile: docProfile({ ...NEAR, homeVisitFee: 900 }) });
    r = await call(doctor, "PATCH", `/api/appointments/${dh!.id}`, { status: "SCHEDULED" });
    check("doctor accepts the home visit", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(doctor, "PATCH", `/api/appointments/${dh!.id}`, { status: "CANCELLED" });
    const moved = await prisma.appointment.findFirst({ where: { reassignedFromId: dh!.id } });
    check("reassigned using the visit location", r.status === 200 && moved?.doctorId === candidate.id, `${r.status} → ${moved?.doctorId === candidate.id ? "candidate" : moved?.doctorId ?? "none"}`);
    check("reassigned booking keeps the snapshot", moved?.visitAddress === "12 Old Lane, Pune" && moved.visitLat === HOME_A.lat && moved.visitPinCode === "411001",
      `${moved?.visitAddress}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.nursePackage.deleteMany({ where: { nurseId: nurse.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.nurseService.deleteMany({ where: { id: service.id } });
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
