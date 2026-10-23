// #71: booking a stranger's mobile number as a walk-in (and cancelling it)
// must not unlock their saved address, allergies or family — not in the
// lookup (/api/doctor/patients/lookup), not copied onto the booking, and not
// in the doctor/desk queue (/api/appointments/me). Only a patient who booked
// the doctor themselves (accepted or held) or was actually seen is "known"
// (src/lib/knownPatient.ts).
//
// Runs against an already running server (BASE_URL, default
// http://localhost:3000) — cash/clinic walk-ins only, so no payment gateway.
// Throwaway users with no push tokens; everything is deleted at the end.
//
//   npm run test:walkin-privacy
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string };
type FeedRow = { id: string; patient: Record<string, unknown>; visit: Record<string, unknown> | null; allergies: string | null };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookieFor(as), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}

async function main() {
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `7${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const doctorProfile = {
    create: {
      status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY),
      consultFee: 300, homeVisitFee: 800, offersClinic: true, offersHomeVisit: true, offersVideo: false,
    },
  };
  const profile = (address: string) => ({
    create: { age: 33, gender: "Female", homeAddress: address, landmark: "Near temple", pinCode: "411038", allergies: "Penicillin", lat: 18.5, lng: 73.8, dependents: { create: { name: "मुलगी", relation: "Daughter", age: 6, gender: "Female" } } },
  });

  try {
    const doctor = await mk({ name: "Privacy Doctor", role: "DOCTOR", doctorProfile });
    const desk = await mk({ name: "Privacy Desk", role: "STAFF" });
    await prisma.staffProfile.create({ data: { userId: desk.id, doctorId: doctor.id, active: true } });
    await prisma.clinic.create({ data: { doctorId: doctor.id, name: "Privacy Clinic", address: "FC Road, Pune", lat: 18.52, lng: 73.85 } });
    const stranger = await mk({ name: "QA Stranger", role: "PATIENT", password: "x", patientProfile: profile("Flat 12, Secret Society, Kothrud") });
    const ownPatient = await mk({ name: "Own Patient", role: "PATIENT", password: "x", patientProfile: profile("7 Own Lane, Baner") });

    const lookup = async (as: U, mobile: string) => (await call(as, "GET", `/api/doctor/patients/lookup?mobile=${mobile}`)).json.patient as Record<string, unknown>;
    const hidden = (p: Record<string, unknown>) => p.known === false && p.homeAddress === null && p.allergies === null && p.landmark === null && (p.dependents as unknown[]).length === 0;
    const feed = async (as: U) => {
      const r = await call(as, "GET", "/api/appointments/me?view=active");
      return (Array.isArray(r.json) ? r.json : []) as unknown as FeedRow[];
    };
    const walkIn = (as: U, body: Record<string, unknown>) =>
      call(as, "POST", "/api/doctor/walk-in-appointments", { consultType: "CLINIC", symptoms: "test visit", paymentMethod: "CASH", consentGiven: true, force: true, ...body });

    // ── The QA repro: book + cancel a stranger ──
    let p = await lookup(desk, stranger.mobile);
    check("lookup before any booking → name only", hidden(p) && p.name === "QA Stranger", JSON.stringify(p));
    let r = await walkIn(desk, { mobile: stranger.mobile, allergies: null });
    const a1 = String((r.json.appointment as J)?.id);
    const row1 = await prisma.appointment.findUnique({ where: { id: a1 } });
    check("walk-in for the stranger → 200, profile allergies NOT copied onto it", r.status === 200 && row1?.allergies === null, `${r.status} ${r.json.error ?? ""} allergies=${row1?.allergies}`);
    let f = await feed(desk);
    const fr = f.find((a) => a.id === a1);
    check("desk queue row: no patientProfile, no allergies, no visit (clinic)", !!fr && !("patientProfile" in fr.patient) && fr.allergies === null && fr.visit === null, JSON.stringify(fr?.patient));
    r = await call(doctor, "PATCH", `/api/appointments/${a1}`, { status: "CANCELLED" });
    check("cancel it → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    p = await lookup(desk, stranger.mobile);
    check("lookup after walk-in + cancel → still hidden (address, allergies, family)", hidden(p), JSON.stringify(p));
    p = await lookup(doctor, stranger.mobile);
    check("…same for the doctor themselves", hidden(p), JSON.stringify({ known: p.known }));
    f = await feed(doctor);
    check("doctor's queue (incl. the cancelled row): no patientProfile on any row", f.length > 0 && f.every((a) => !("patientProfile" in a.patient)) && !JSON.stringify(f).includes("Secret Society"), `${f.length} rows`);

    // ── Home walk-in for the stranger ──
    r = await walkIn(desk, { mobile: stranger.mobile, consultType: "HOME" });
    check("HOME walk-in with no typed address → 400 ADDRESS_REQUIRED (saved address not used)", r.status === 400 && r.json.code === "ADDRESS_REQUIRED", `${r.status} ${r.json.code}`);
    r = await walkIn(desk, { mobile: stranger.mobile, consultType: "HOME", visit: { address: "Flat 12, Secret Society, Kothrud" } });
    const a2 = String((r.json.appointment as J)?.id);
    const row2 = await prisma.appointment.findUnique({ where: { id: a2 } });
    check("…typed address = saved one → booked, but saved coordinates not attached", r.status === 200 && row2?.visitAddress === "Flat 12, Secret Society, Kothrud" && row2.visitLat === null, `${r.status} lat=${row2?.visitLat}`);
    f = await feed(desk);
    const hv = f.find((a) => a.id === a2);
    check("…queue visit = the booking snapshot only", hv?.visit?.address === "Flat 12, Secret Society, Kothrud" && hv.visit.lat === null && hv.visit.snapshot === true, JSON.stringify(hv?.visit));
    // A desk-made HOME row with no snapshot (shouldn't happen) never falls back to the profile.
    const bare = await prisma.appointment.create({ data: { patientId: stranger.id, doctorId: doctor.id, symptoms: "x", status: "SCHEDULED", consultType: "HOME", paymentMethod: "CASH", amount: 800, bookedById: desk.id } });
    f = await feed(desk);
    const bv = f.find((a) => a.id === bare.id);
    check("desk-made HOME row without snapshot → no address from the profile", !!bv && bv.visit?.address === null && bv.visit.lat === null, JSON.stringify(bv?.visit));

    // ── A patient who booked the doctor themselves ──
    const own = await prisma.appointment.create({ data: { patientId: ownPatient.id, doctorId: doctor.id, symptoms: "own booking", status: "SCHEDULED", consultType: "HOME", paymentMethod: "CASH", amount: 800, scheduledAt: new Date(Date.now() + 3600_000) } });
    p = await lookup(desk, ownPatient.mobile);
    check("patient's own accepted booking → known: address, allergies, family", p.known === true && p.homeAddress === "7 Own Lane, Baner" && p.allergies === "Penicillin" && (p.dependents as unknown[]).length === 1, JSON.stringify({ known: p.known }));
    f = await feed(desk);
    const ov = f.find((a) => a.id === own.id);
    check("…their older HOME booking (no snapshot) still navigates from the profile, server-side", ov?.visit?.address === "7 Own Lane, Baner" && ov.visit.lat === 18.5 && ov.visit.snapshot === false && !("patientProfile" in ov.patient), JSON.stringify(ov?.visit));
    await prisma.appointment.update({ where: { id: own.id }, data: { status: "PENDING_APPROVAL" } });
    p = await lookup(desk, ownPatient.mobile);
    check("…a request not yet accepted doesn't count", p.known === false, `${p.known}`);
    await prisma.appointment.update({ where: { id: own.id }, data: { status: "CANCELLED" } });
    await prisma.appointment.update({ where: { id: a1 }, data: { status: "COMPLETED" } });
    p = await lookup(desk, stranger.mobile);
    check("a walk-in that reached COMPLETED (actually seen) → known", p.known === true && p.homeAddress === "Flat 12, Secret Society, Kothrud", `${p.known}`);
    r = await walkIn(desk, { mobile: stranger.mobile, allergies: null });
    const row3 = await prisma.appointment.findUnique({ where: { id: String((r.json.appointment as J)?.id) } });
    check("…and then profile allergies are reused for the next walk-in", r.status === 200 && row3?.allergies === "Penicillin", `${r.status} ${row3?.allergies}`);
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.staffProfile.deleteMany({ where: { OR: [{ userId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.clinic.deleteMany({ where: { doctorId: { in: ids } } });
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
