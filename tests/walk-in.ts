// Walk-in / phone-in booking (/doctor/walk-in): the doctor or their front desk
// (STAFF) looks a patient up by mobile and books them straight into the queue
// — SCHEDULED, priced from the doctor's own fee, paid in cash at the visit or
// online through a sign-in-free pay link (src/lib/guestPaymentToken.ts) whose
// Cashfree order the existing webhook settles. A new number gets a
// passwordless account the patient later claims by registering.
//
// Like test:payments, this starts its OWN dev server (MOCK_PORT env, default 3100, else a free port; tests/devServer.ts) with
// Cashfree pointed at an in-process mock and a test-only secret, so no real
// gateway order is ever created. Stop any running `next dev` first. Uses the
// DB in .env, throwaway users only.
//
//   npm run test:walk-in
import "dotenv/config";
import crypto from "crypto";
import http from "http";
import type { ChildProcess } from "child_process";
import type { AddressInfo } from "net";
import { startDevServer } from "./devServer";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { addDaysYmd } from "../src/lib/istDate";
import { todayIsoDateIst } from "../src/lib/clinicAvailability";

let MOCK_PORT = 0; // mock Cashfree: free port picked in main()
let BASE = ""; // set by startServer (MOCK_PORT env, default 3100, else a free port)
const TEST_SECRET = "test-only-cashfree-secret";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// ── Mock Cashfree ──
const mock = { createdOrders: [] as { order_id: string; order_amount: number; customer_details: { customer_id: string; customer_phone: string }; order_meta: { return_url: string } }[], payments: new Map<string, unknown[]>() };
const mockServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/orders") {
      const o = JSON.parse(body);
      mock.createdOrders.push(o);
      res.end(JSON.stringify({ payment_session_id: `sess_${o.order_id}`, cf_order_id: `cf_${o.order_id}` }));
      return;
    }
    const m = /^\/orders\/([^/]+)\/payments$/.exec(req.url ?? "");
    if (req.method === "GET" && m) {
      res.end(JSON.stringify(mock.payments.get(decodeURIComponent(m[1])) ?? []));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
});

async function startServer(): Promise<ChildProcess> {
  const { child, base } = await startDevServer({
    label: "walk-in",
    env: { CASHFREE_API_BASE: `http://127.0.0.1:${MOCK_PORT}`, CASHFREE_APP_ID: "test-app", CASHFREE_SECRET_KEY: TEST_SECRET },
  });
  BASE = base;
  return child;
}

async function webhook(orderId: string, amount: number) {
  const paymentId = `pay_walkin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const body = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    event_time: new Date().toISOString(),
    data: { order: { order_id: orderId, order_amount: amount }, payment: { cf_payment_id: paymentId, payment_status: "SUCCESS" } },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(ts + body).digest("base64");
  const r = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-signature": sig, "x-webhook-timestamp": ts }, body });
  return { status: r.status, paymentId };
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; code?: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(as ? { Cookie: cookieFor(as) } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}
const tokenOf = (url: unknown) => new URL(String(url)).searchParams.get("t") ?? "";

async function main() {
  await new Promise<void>((r) => mockServer.listen(0, "127.0.0.1", r));
  MOCK_PORT = (mockServer.address() as AddressInfo).port;
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mob = () => `8${stamp}${String(n++).padStart(2, "0")}`;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: mob(), termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const doctorProfile = (extra: Record<string, unknown> = {}) => ({
    create: {
      status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY),
      consultFee: 500, homeVisitFee: 800, videoFee: 300, offersClinic: true, offersHomeVisit: true, offersVideo: true, ...extra,
    },
  });
  const allWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ dayOfWeek: d, fromTime: "06:00", toTime: "22:00" }));

  const doctor = await mk({ name: "Walkin Doctor", role: "DOCTOR", doctorProfile: doctorProfile() });
  const clinic = await prisma.clinic.create({ data: { doctorId: doctor.id, name: "Walkin Clinic", address: "FC Road, Pune", lat: 18.52, lng: 73.85, slots: { create: allWeek } } });
  const clinic2 = await prisma.clinic.create({ data: { doctorId: doctor.id, name: "Walkin Clinic 2", address: "Baner, Pune", lat: 18.56, lng: 73.78, sortOrder: 1 } });
  const freeDoctor = await mk({ name: "Free Doctor", role: "DOCTOR", doctorProfile: doctorProfile({ consultFee: 0, offersHomeVisit: false }) });
  const other = await mk({ name: "Other Doctor", role: "DOCTOR", doctorProfile: doctorProfile() });
  const expired = await mk({ name: "Expired Doctor", role: "DOCTOR", doctorProfile: doctorProfile({ trialEndsAt: new Date(Date.now() - DAY) }) });
  const mkStaff = async (doctorId: string, active = true) => {
    const s = await mk({ name: "Front Desk", role: "STAFF" });
    await prisma.staffProfile.create({ data: { userId: s.id, doctorId, active } });
    return s;
  };
  const desk = await mkStaff(doctor.id);
  const desk2 = await mkStaff(doctor.id);
  const otherDesk = await mkStaff(other.id);
  const expiredDesk = await mkStaff(expired.id);
  const revokedDesk = await mkStaff(doctor.id, false);
  const regular = await mk({ name: "Regular Patient", role: "PATIENT", password: "x", patientProfile: { create: { age: 40, gender: "Female", allergies: "Penicillin", homeAddress: "12 MG Road, Pune", lat: 18.51, lng: 73.86, dependents: { create: { name: "Riya", relation: "Daughter", age: 8, gender: "Female" } } } } });
  const quick = await mk({ name: "", role: "PATIENT", password: "x", patientProfile: { create: { age: 0, gender: "" } } });
  const nurse = await mk({ name: "Some Nurse", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });
  const newMobile = mob();
  const newMobile2 = mob();
  const newMobile3 = mob();
  const createdIds = async () => (await prisma.user.findMany({ where: { mobile: { in: [newMobile, newMobile2, newMobile3] } }, select: { id: true } })).map((u) => u.id);
  const racer = await mk({ name: "Race Patient", role: "PATIENT", password: "x", patientProfile: { create: { age: 30, gender: "Male" } } });
  const spaced = (m: string) => `+91 ${m.slice(0, 5)} ${m.slice(5)}`;

  const book = (as: U, body: Record<string, unknown>) =>
    call(as, "POST", "/api/doctor/walk-in-appointments", { consultType: "CLINIC", clinicId: clinic.id, symptoms: "Fever since 2 days", paymentMethod: "CASH", consentGiven: true, ...body });
  const appt = (id: unknown) => prisma.appointment.findUniqueOrThrow({ where: { id: String(id) } });
  const tomorrow = addDaysYmd(todayIsoDateIst(), 1);
  const at = (hhmm: string, ymd = tomorrow) => new Date(`${ymd}T${hhmm}:00+05:30`).toISOString();

  let server: ChildProcess | null = null;
  try {
    server = await startServer();
    // Compile the routes before anything timing-sensitive.
    await call(desk, "GET", "/api/doctor/walk-in-appointments");
    await fetch(`${BASE}/api/payments/webhook`);

    // ── Context ──
    let r = await call(desk, "GET", "/api/doctor/walk-in-appointments");
    const types = r.json.types as { type: string; fee: number }[];
    check("form context for STAFF → their doctor's types, fees and clinics", r.status === 200 && r.json.doctorId === doctor.id && types.length === 3 && types[0].fee === 500 && (r.json.clinics as unknown[]).length === 2 && r.json.blocked === null, `${r.status} ${JSON.stringify(types)}`);
    r = await call(expiredDesk, "GET", "/api/doctor/walk-in-appointments");
    check("…an expired doctor's desk sees why it's closed", r.status === 200 && /plan has expired/.test(String(r.json.blocked)), String(r.json.blocked));
    r = await call(regular, "GET", "/api/doctor/walk-in-appointments");
    check("…a patient → 403", r.status === 403, `${r.status}`);

    // ── Lookup ──
    r = await call(null, "GET", `/api/doctor/patients/lookup?mobile=${newMobile}`);
    check("lookup signed out → 401", r.status === 401, `${r.status}`);
    r = await call(regular, "GET", `/api/doctor/patients/lookup?mobile=${newMobile}`);
    check("lookup as a patient → 403", r.status === 403, `${r.status}`);
    r = await call(revokedDesk, "GET", `/api/doctor/patients/lookup?mobile=${newMobile}`);
    check("lookup as revoked staff → 403", r.status === 403, `${r.status} ${r.json.error}`);
    r = await call(desk, "GET", `/api/doctor/patients/lookup?mobile=12345`);
    check("lookup with a bad number → 400", r.status === 400, `${r.status}`);
    r = await call(desk, "GET", `/api/doctor/patients/lookup?mobile=${encodeURIComponent(`+91 ${newMobile.slice(0, 5)} ${newMobile.slice(5)}`)}`);
    check("unknown number (+91, spaced) → new patient", r.status === 200 && r.json.exists === false && r.json.mobile === newMobile, JSON.stringify(r.json));
    r = await call(desk, "GET", `/api/doctor/patients/lookup?mobile=${nurse.mobile}`);
    check("a nurse's number → 409 NOT_A_PATIENT", r.status === 409 && r.json.code === "NOT_A_PATIENT", `${r.status} ${r.json.code}`);
    r = await call(desk, "GET", `/api/doctor/patients/lookup?mobile=${regular.mobile}`);
    let p = r.json.patient as Record<string, unknown>;
    check("patient new to this doctor → name only: no address, allergies or family", r.status === 200 && p.name === "Regular Patient" && p.known === false && p.homeAddress === null && p.allergies === null && (p.dependents as unknown[]).length === 0, JSON.stringify(p));

    // ── New patient, cash, now ──
    r = await book(desk, { mobile: newMobile, name: "Walkin New", age: 33 });
    check("new patient without gender → 400 PROFILE_INCOMPLETE", r.status === 400 && r.json.code === "PROFILE_INCOMPLETE", `${r.status} ${r.json.error}`);
    r = await book(desk, { mobile: newMobile, name: "Walkin New", age: 33, gender: "Male", consentGiven: false });
    check("without the consent tick → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await book(desk, { mobile: newMobile, name: "Walkin New", age: 33, gender: "Male", amount: 1, platformFee: 0, status: "COMPLETED" });
    const a1 = r.json.appointment as Record<string, unknown>;
    let row = await appt(a1?.id);
    check("staff books a new patient → 200, SCHEDULED, CASH, accepted now", r.status === 200 && row.status === "SCHEDULED" && row.paymentMethod === "CASH" && row.paymentStatus === "PENDING" && !!row.acceptedAt && r.json.patientCreated === true && r.json.payment === null, `${r.status} ${row.status}/${row.paymentMethod}`);
    check("…fee is the doctor's ₹500, not the ₹1 sent", row.amount === 500 && row.platformFee > 0, `amount ${row.amount}, platformFee ${row.platformFee}`);
    check("…booked at the clinic, \"now\" (not a timed slot), by the desk", row.clinicId === clinic.id && row.scheduledAt.getTime() === row.createdAt.getTime() && row.bookedById === desk.id, `clinic ${row.clinicId === clinic.id}, bookedBy ${row.bookedById === desk.id}`);
    const created = await prisma.user.findUniqueOrThrow({ where: { mobile: newMobile }, include: { patientProfile: true } });
    check("…passwordless PATIENT account with name/age/gender", created.role === "PATIENT" && created.password === "" && created.name === "Walkin New" && created.patientProfile?.age === 33 && created.patientProfile.gender === "Male", `${created.role} pw=${JSON.stringify(created.password)} ${created.patientProfile?.age}/${created.patientProfile?.gender}`);
    const cashId = String(a1.id);

    // ── Duplicate guard ──
    r = await book(desk, { mobile: newMobile });
    check("same person again → 409 DUPLICATE_BOOKING", r.status === 409 && r.json.code === "DUPLICATE_BOOKING", `${r.status} ${r.json.error}`);
    r = await book(desk, { mobile: newMobile, force: true, consultType: "VIDEO", clinicId: null });
    check("…with force → 200 (a video consult, ₹300)", r.status === 200 && (await appt((r.json.appointment as J).id)).amount === 300, `${r.status} ${r.json.error ?? ""}`);

    // ── #73: parallel bookings for one person (double-tap, or desk + doctor at once) ──
    const race = async (body: Record<string, unknown>) => {
      const rs = await Promise.all([desk, desk2, doctor].map((u) => book(u, { symptoms: "ताप आणि खोकला", ...body })));
      return { ok: rs.filter((x) => x.status === 200).length, dup: rs.filter((x) => x.status === 409).length, rs };
    };
    let rc = await race({ mobile: spaced(racer.mobile) });
    let made = await prisma.appointment.count({ where: { patientId: racer.id, doctorId: doctor.id } });
    check("3 parallel POSTs, existing patient → 1×200 + 2×409 DUPLICATE_BOOKING, 1 appointment", rc.ok === 1 && rc.dup === 2 && rc.rs.every((x) => x.status === 200 || x.json.code === "DUPLICATE_BOOKING") && made === 1, `${rc.rs.map((x) => `${x.status}/${x.json.code ?? ""}`).join(" ")} appts=${made}`);
    rc = await race({ mobile: racer.mobile, newDependent: { name: "Aarav", relation: "Son" } });
    made = await prisma.appointment.count({ where: { patientId: racer.id, doctorId: doctor.id } });
    const aarav = await prisma.patientDependent.count({ where: { patientProfile: { userId: racer.id } } });
    check("…same new family member typed at once → 1×200 + 2×409, one dependent", rc.ok === 1 && rc.dup === 2 && made === 2 && aarav === 1, `${rc.rs.map((x) => `${x.status}/${x.json.code ?? ""}`).join(" ")} appts=${made} deps=${aarav}`);
    rc = await race({ mobile: spaced(newMobile3), name: "Race New", age: 22, gender: "Female" });
    const newRacers = await prisma.user.findMany({ where: { mobile: newMobile3 }, select: { id: true } });
    made = await prisma.appointment.count({ where: { patientId: { in: newRacers.map((u) => u.id) } } });
    check("…a brand-new number booked at once → 1×200 + 2×409, one account, one appointment", rc.ok === 1 && rc.dup === 2 && newRacers.length === 1 && made === 1, `${rc.rs.map((x) => `${x.status}/${x.json.code ?? ""}`).join(" ")} users=${newRacers.length} appts=${made}`);

    // ── Several clinics: must pick one ──
    r = await book(desk, { mobile: newMobile2, name: "Second New", age: 50, gender: "Female", clinicId: null });
    check("doctor with 2 clinics, none picked → 400", r.status === 400 && /clinic/i.test(String(r.json.error)), `${r.status} ${r.json.error}`);
    r = await book(desk, { mobile: newMobile2, name: "Second New", age: 50, gender: "Female", clinicId: clinic2.id });
    check("…the second clinic (no posted hours) → 200", r.status === 200 && (await appt((r.json.appointment as J).id)).clinicId === clinic2.id, `${r.status} ${r.json.error ?? ""}`);

    // ── Existing patients ──
    r = await book(desk, { mobile: regular.mobile, name: "Someone Else", newDependent: { name: "Riya", relation: "Daughter" } });
    const riyaAppt = await appt((r.json.appointment as J)?.id);
    const deps = await prisma.patientDependent.findMany({ where: { patientProfile: { userId: regular.id } } });
    check("family member typed again by name → reuses the saved one", r.status === 200 && deps.length === 1 && riyaAppt.dependentId === deps[0].id && riyaAppt.patientName === "Riya" && riyaAppt.relation === "Daughter", `${r.status} deps=${deps.length}`);
    check("…and never renames the account holder", (await prisma.user.findUniqueOrThrow({ where: { id: regular.id } })).name === "Regular Patient", "name kept");
    // #71: a booking the desk made itself doesn't make a stranger "known".
    r = await call(desk, "GET", `/api/doctor/patients/lookup?mobile=${regular.mobile}`);
    p = r.json.patient as Record<string, unknown>;
    check("a desk-made walk-in alone keeps the address, allergies and family hidden", p.known === false && p.homeAddress === null && p.allergies === null && (p.dependents as unknown[]).length === 0, JSON.stringify({ known: p.known, addr: p.homeAddress }));
    r = await call(desk, "GET", "/api/appointments/me?view=active");
    const riyaRow = (Array.isArray(r.json) ? r.json : []) as { id: string; patient: Record<string, unknown> }[];
    const riyaFeed = riyaRow.find((a) => a.id === riyaAppt.id);
    check("…and the desk's queue carries no saved profile address", !!riyaFeed && !("patientProfile" in riyaFeed.patient), JSON.stringify(riyaFeed?.patient));
    // The patient booked this doctor themselves once, and was seen.
    await prisma.appointment.create({ data: { patientId: regular.id, doctorId: doctor.id, symptoms: "Earlier own visit", status: "COMPLETED", paymentMethod: "CASH", amount: 500, scheduledAt: new Date(Date.now() - 20 * DAY) } });
    r = await call(desk, "GET", `/api/doctor/patients/lookup?mobile=${regular.mobile}`);
    p = r.json.patient as Record<string, unknown>;
    check("once seen after booking themselves, lookup shows the family, allergies and address", p.known === true && (p.dependents as unknown[]).length === 1 && p.allergies === "Penicillin" && p.homeAddress === "12 MG Road, Pune", JSON.stringify({ known: p.known, deps: (p.dependents as unknown[]).length }));
    r = await book(desk, { mobile: regular.mobile, dependentId: deps[0].id });
    check("booking Riya again → DUPLICATE_BOOKING", r.status === 409 && r.json.code === "DUPLICATE_BOOKING", `${r.status}`);
    r = await book(desk, { mobile: regular.mobile, dependentId: "not-theirs" });
    check("a dependent id from another account → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await book(desk, { mobile: regular.mobile });
    const selfRow = await appt((r.json.appointment as J)?.id);
    check("account holder themselves (separate from Riya) → 200, allergies from profile", r.status === 200 && selfRow.relation === "Self" && selfRow.allergies === "Penicillin", `${r.status} ${selfRow.allergies}`);
    r = await book(desk, { mobile: quick.mobile });
    check("quick-signup patient with no name/age/gender → 400 PROFILE_INCOMPLETE", r.status === 400 && r.json.code === "PROFILE_INCOMPLETE", `${r.status} ${JSON.stringify(r.json.missing)}`);
    r = await book(doctor, { mobile: quick.mobile, name: "Quick Filled", age: 27, gender: "Other" });
    const q = await prisma.user.findUniqueOrThrow({ where: { id: quick.id }, include: { patientProfile: true } });
    check("…the doctor fills them in while booking", r.status === 200 && q.name === "Quick Filled" && q.patientProfile?.age === 27 && q.patientProfile.gender === "Other" && q.password === "x", `${r.status} ${q.name} ${q.patientProfile?.age}`);
    r = await book(desk, { mobile: nurse.mobile, name: "X Y", age: 30, gender: "Male" });
    check("booking a nurse's number → 409 NOT_A_PATIENT", r.status === 409 && r.json.code === "NOT_A_PATIENT", `${r.status}`);

    // ── Who may book ──
    r = await book(regular, { mobile: newMobile });
    check("a patient can't use it → 403", r.status === 403, `${r.status}`);
    r = await book(revokedDesk, { mobile: newMobile, force: true });
    check("revoked staff → 403", r.status === 403, `${r.status}`);
    r = await book(expiredDesk, { mobile: newMobile, force: true, clinicId: null });
    check("expired doctor's staff → 403 SUBSCRIPTION_EXPIRED", r.status === 403 && r.json.code === "SUBSCRIPTION_EXPIRED", `${r.status} ${r.json.code}`);
    r = await book(otherDesk, { mobile: newMobile, clinicId: clinic.id });
    check("another doctor's desk can't use this doctor's clinic → 400", r.status === 400, `${r.status} ${r.json.error}`);

    // ── Scheduled later ──
    r = await book(desk, { mobile: regular.mobile, force: true, scheduledAt: at("10:00") });
    const timed = await appt((r.json.appointment as J)?.id);
    check("later, on a clinic slot → 200, timed", r.status === 200 && timed.scheduledAt.toISOString() === at("10:00") && (r.json.appointment as J).timed === true, `${r.status} ${r.json.error ?? ""}`);
    r = await book(desk, { mobile: newMobile2, force: true, scheduledAt: at("10:00") });
    check("the same slot for someone else → 409 SLOT_TAKEN", r.status === 409 && r.json.code === "SLOT_TAKEN", `${r.status} ${r.json.error}`);
    r = await book(desk, { mobile: newMobile2, force: true, scheduledAt: at("10:03") });
    check("a time between slots → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await book(desk, { mobile: newMobile2, force: true, scheduledAt: at("23:00") });
    check("outside the clinic's hours → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await book(desk, { mobile: newMobile2, force: true, scheduledAt: new Date(Date.now() - 3600_000).toISOString() });
    check("a time in the past → 400", r.status === 400, `${r.status}`);

    // ── Home visit ──
    r = await book(desk, { mobile: newMobile2, force: true, consultType: "HOME", clinicId: null });
    check("home visit for someone with no saved address → 400 ADDRESS_REQUIRED", r.status === 400 && r.json.code === "ADDRESS_REQUIRED", `${r.status} ${r.json.code}`);
    r = await book(desk, { mobile: newMobile2, force: true, consultType: "HOME", clinicId: null, visit: { address: "Flat 4, Aundh, Pune", landmark: "Near park", pinCode: "411007" } });
    const home = await appt((r.json.appointment as J)?.id);
    check("…with a typed address → 200, ₹800, address snapshotted", r.status === 200 && home.amount === 800 && home.visitAddress === "Flat 4, Aundh, Pune" && home.visitPinCode === "411007" && home.clinicId === null, `${r.status} ${home.visitAddress}`);
    r = await book(desk, { mobile: regular.mobile, force: true, consultType: "HOME", clinicId: null });
    const savedHome = await appt((r.json.appointment as J)?.id);
    check("…an existing patient's saved address (with its coordinates)", r.status === 200 && savedHome.visitAddress === "12 MG Road, Pune" && savedHome.visitLat === 18.51, `${r.status} ${savedHome.visitAddress}`);
    r = await call(desk, "POST", "/api/doctor/walk-in-appointments", { mobile: newMobile2, consultType: "HOME", symptoms: "Back pain", paymentMethod: "CASH", consentGiven: true, force: true, visit: { address: "x", pinCode: "12" } });
    check("…a bad PIN code → 400", r.status === 400, `${r.status} ${r.json.error}`);

    // ── Online: pay link, guest checkout, webhook ──
    r = await book(desk, { mobile: newMobile2, force: true, paymentMethod: "ONLINE", clinicId: clinic.id });
    const onlineId = String((r.json.appointment as J)?.id);
    const payUrl = (r.json.payment as J)?.url;
    check("online walk-in → 200 with a pay link", r.status === 200 && typeof payUrl === "string" && String(payUrl).includes(`/pay/${onlineId}?t=`), `${r.status} ${payUrl}`);
    const token = tokenOf(payUrl);
    r = await call(null, "GET", `/api/payments/guest-status?t=${encodeURIComponent(token)}`);
    check("guest-status with the token, signed out → the bill", r.status === 200 && r.json.id === onlineId && r.json.payable === 500 && r.json.paymentStatus === "PENDING" && r.json.patientName === "Second New", `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
    r = await call(null, "GET", `/api/payments/guest-status?t=${encodeURIComponent(token.slice(0, -3) + "abc")}`);
    check("…a tampered token → 401", r.status === 401, `${r.status}`);
    const sessionLike = jwt.sign({ id: onlineId, name: "x", role: "PATIENT", mobile: "x", tv: 0 }, SECRET);
    r = await call(null, "GET", `/api/payments/guest-status?t=${encodeURIComponent(sessionLike)}`);
    check("…a session token isn't a pay token → 401", r.status === 401, `${r.status}`);
    const asSession = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: `doconclick_token=${token}` } });
    check("…and a pay token isn't a session", asSession.status === 401 || !(await asSession.json().catch(() => null))?.id, `${asSession.status}`);
    const expiredToken = jwt.sign({ appt: onlineId, purpose: "guestpay" }, SECRET, { expiresIn: -10 });
    r = await call(null, "POST", "/api/payments/guest-create-order", { token: expiredToken });
    check("guest-create-order with an expired link → 401 LINK_EXPIRED", r.status === 401 && r.json.code === "LINK_EXPIRED", `${r.status}`);

    const before = mock.createdOrders.length;
    r = await call(null, "POST", "/api/payments/guest-create-order", { token });
    const order = mock.createdOrders[before];
    check("guest-create-order → a ₹500 gateway order for the patient", r.status === 200 && r.json.paymentSessionId === `sess_${order?.order_id}` && order.order_amount === 500 && order.customer_details.customer_phone === newMobile2, `${r.status} ${r.json.error ?? ""}`);
    check("…returns to /pay/<id>/return with the token", !!order && order.order_meta.return_url.includes(`/pay/${onlineId}/return?t=`), order?.order_meta.return_url ?? "");
    const rec = await prisma.paymentOrder.findUnique({ where: { orderId: order.order_id }, include: { items: true } });
    check("…recorded as a PaymentOrder for this appointment", rec?.patientId === (await appt(onlineId)).patientId && rec.items[0]?.appointmentId === onlineId, `${rec?.amount}`);

    // Payment lands while the desk has switched it to cash — still settled as online.
    r = await call(desk, "PATCH", `/api/doctor/appointments/${onlineId}/payment-method`, { paymentMethod: "CASH" });
    check("desk switches the walk-in to cash → 200", r.status === 200 && (await appt(onlineId)).paymentMethod === "CASH", `${r.status} ${r.json.error ?? ""}`);
    r = await call(null, "POST", "/api/payments/guest-create-order", { token });
    check("…the pay link now refuses a new checkout", r.status === 400, `${r.status} ${r.json.error}`);
    const w = await webhook(order.order_id, 500);
    row = await appt(onlineId);
    check("webhook for the earlier checkout → PAID, recorded as online", w.status === 200 && row.paymentStatus === "PAID" && row.paymentMethod === "ONLINE" && row.cashfreeOrderId === order.order_id, `${w.status} ${row.paymentStatus}/${row.paymentMethod}`);
    r = await call(null, "GET", `/api/payments/guest-status?t=${encodeURIComponent(token)}`);
    check("guest-status shows PAID", r.json.paymentStatus === "PAID", String(r.json.paymentStatus));

    // verify=1 fallback (webhook lost).
    r = await book(desk, { mobile: newMobile2, force: true, paymentMethod: "ONLINE", consultType: "VIDEO", clinicId: null });
    const vId = String((r.json.appointment as J)?.id);
    const vToken = tokenOf((r.json.payment as J)?.url);
    const vBefore = mock.createdOrders.length;
    await call(null, "POST", "/api/payments/guest-create-order", { token: vToken });
    const vOrder = mock.createdOrders[vBefore];
    mock.payments.set(vOrder.order_id, [{ cf_payment_id: `pay_v_${stamp}`, payment_status: "SUCCESS", payment_amount: 300 }]);
    r = await call(null, "GET", `/api/payments/guest-status?t=${encodeURIComponent(vToken)}`);
    check("without verify, an unannounced payment isn't settled", r.json.paymentStatus === "PENDING", String(r.json.paymentStatus));
    r = await call(null, "GET", `/api/payments/guest-status?t=${encodeURIComponent(vToken)}&verify=1`);
    check("verify=1 asks the gateway and settles it", r.json.paymentStatus === "PAID" && (await appt(vId)).paymentStatus === "PAID", String(r.json.paymentStatus));

    // ── Pay link from the dashboard ──
    r = await call(desk, "POST", `/api/doctor/appointments/${cashId}/payment-link`);
    check("pay link for a cash visit → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(desk, "PATCH", `/api/doctor/appointments/${cashId}/payment-method`, { paymentMethod: "ONLINE" });
    check("desk switches cash → online → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    r = await call(desk, "POST", `/api/doctor/appointments/${cashId}/payment-link`);
    check("…then a pay link → 200, ₹500, patient's mobile for WhatsApp", r.status === 200 && r.json.amount === 500 && r.json.patientMobile === newMobile && String(r.json.url).includes(`/pay/${cashId}?t=`), `${r.status}`);
    r = await call(otherDesk, "POST", `/api/doctor/appointments/${cashId}/payment-link`);
    check("another doctor's desk → 404", r.status === 404, `${r.status}`);
    r = await call(otherDesk, "PATCH", `/api/doctor/appointments/${cashId}/payment-method`, { paymentMethod: "CASH" });
    check("…can't switch it either → 404", r.status === 404, `${r.status}`);
    r = await call(desk, "PATCH", `/api/doctor/appointments/${onlineId}/payment-method`, { paymentMethod: "CASH" });
    check("switching a paid visit → 400", r.status === 400, `${r.status}`);
    const own = await prisma.appointment.create({ data: { patientId: regular.id, doctorId: doctor.id, symptoms: "Own booking", status: "SCHEDULED", paymentMethod: "ONLINE", amount: 500 } });
    r = await call(desk, "PATCH", `/api/doctor/appointments/${own.id}/payment-method`, { paymentMethod: "CASH" });
    check("a patient's own app booking can't be switched to cash → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(desk, "POST", `/api/doctor/appointments/${own.id}/payment-link`);
    check("…but the desk can show it a pay QR → 200", r.status === 200, `${r.status}`);
    await call(desk, "PATCH", `/api/doctor/appointments/${cashId}/payment-method`, { paymentMethod: "CASH" });

    // ── ₹0 fee ──
    r = await book(freeDoctor, { mobile: newMobile2, force: true, paymentMethod: "ONLINE", clinicId: null });
    check("₹0 fee, online → PAID straight away, no link", r.status === 200 && (r.json.appointment as J).paymentStatus === "PAID" && r.json.payment === null, `${r.status} ${(r.json.appointment as J)?.paymentStatus}`);

    // ── Cancelling a walk-in (#70): never handed to another doctor ──
    // A free, nearby doctor of the same kind exists, so a patient's own booking
    // would be reassigned to them — a desk-made walk-in must not be.
    await prisma.clinic.create({ data: { doctorId: other.id, name: "Other Clinic", address: "FC Road, Pune", lat: 18.52, lng: 73.85, slots: { create: allWeek } } });
    // Pushes are fire-and-forget — wait for the walkInCancelled inbox row.
    const inboxKinds = async (userId: string) => {
      let kinds: (string | null)[] = [];
      for (let i = 0; i < 20 && !kinds.includes("walkInCancelled"); i++) {
        if (i) await new Promise((res) => setTimeout(res, 150));
        kinds = (await prisma.notification.findMany({ where: { userId }, select: { kind: true } })).map((x) => x.kind);
      }
      return kinds;
    };
    await prisma.notification.deleteMany({ where: { userId: regular.id } });
    r = await book(desk, { mobile: regular.mobile, force: true, symptoms: "Double entry" });
    const dupId = String((r.json.appointment as J)?.id);
    // The booking itself legitimately pushes walkInBookedPatient (fire-and-forget).
    // Wait for it to land before clearing the inbox, or it arrives after the
    // clean-up and looks like an extra push on cancel.
    for (let i = 0; i < 40; i++) {
      if (await prisma.notification.count({ where: { userId: regular.id, kind: "walkInBookedPatient" } })) break;
      await new Promise((res) => setTimeout(res, 150));
    }
    await prisma.notification.deleteMany({ where: { userId: { in: [regular.id, other.id] } } });
    r = await call(desk, "PATCH", `/api/appointments/${dupId}`, { status: "CANCELLED" });
    const replacements = await prisma.appointment.count({ where: { reassignedFromId: dupId } });
    check("desk cancels its own cash walk-in → CANCELLED, no replacement booked", r.status === 200 && (await appt(dupId)).status === "CANCELLED" && replacements === 0, `${r.status} ${r.json.error ?? ""} replacements=${replacements}`);
    const kinds = await inboxKinds(regular.id);
    check("…patient gets the neutral walkInCancelled push, not the emergency/reassigned one", kinds.length === 1 && kinds[0] === "walkInCancelled", JSON.stringify(kinds));
    check("…no request pushed to the other doctor", (await prisma.notification.count({ where: { userId: other.id } })) === 0, "other doctor inbox empty");
    r = await call(doctor, "PATCH", `/api/appointments/${vId}`, { status: "CANCELLED" });
    const vUser = (await appt(vId)).patientId;
    const refundRow = await prisma.walletTransaction.findUnique({ where: { refundOfAppointmentId: vId } });
    check("doctor cancels a paid walk-in → refunded to the wallet (CANCELLATION_REFUND), not reassigned", r.status === 200 && refundRow?.type === "CANCELLATION_REFUND" && refundRow.amount === 300 && (await prisma.appointment.count({ where: { reassignedFromId: vId } })) === 0, `${r.status} ${refundRow?.type} ${refundRow?.amount}`);
    await inboxKinds(vUser);
    const vNote = await prisma.notification.findFirst({ where: { userId: vUser, kind: "walkInCancelled" } });
    check("…its push says the ₹300 went back to the wallet, with no emergency wording", !!vNote && vNote.body.includes("₹300") && !/emergency/i.test(vNote.body), vNote?.body ?? "no walkInCancelled row");

    // ── Completing a cash walk-in ──
    r = await call(desk, "PATCH", `/api/appointments/${cashId}`, { status: "COMPLETED" });
    check("staff can't complete it → 403", r.status === 403, `${r.status}`);
    r = await call(doctor, "PATCH", `/api/appointments/${cashId}`, { status: "COMPLETED" });
    row = await appt(cashId);
    check("doctor completes the cash visit → COMPLETED + PAID", r.status === 200 && row.status === "COMPLETED" && row.paymentStatus === "PAID" && !!row.paidAt, `${r.status} ${row.status}/${row.paymentStatus} ${r.json.error ?? ""}`);

    // ── The queue shows it ──
    r = await call(desk, "GET", "/api/appointments/me");
    const feed = (Array.isArray(r.json) ? r.json : []) as { id: string; bookedById: string | null }[];
    check("desk's queue lists walk-ins with bookedById", feed.some((a) => a.id === onlineId && a.bookedById === desk.id), `${feed.length} rows`);

    // ── The patient claims the account ──
    const reg = await fetch(`${BASE}/api/patients/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mobile: newMobile, password: "secret123", confirmPassword: "secret123", acceptTerms: true }) });
    const regJson = await reg.json().catch(() => ({}));
    const claimed = await prisma.user.findUniqueOrThrow({ where: { mobile: newMobile } });
    check("registering with the walk-in number → signs into the same account", reg.status === 200 && regJson.id === created.id && claimed.password.length > 20 && claimed.name === "Walkin New", `${reg.status} ${regJson.error ?? ""}`);
    const mine = await call(claimed as unknown as U, "GET", "/api/appointments/me");
    const mineRows = (Array.isArray(mine.json) ? mine.json : []) as { id: string }[];
    check("…and sees the visits booked for them", mineRows.some((a) => a.id === cashId), `${mineRows.length} rows`);
    const again = await fetch(`${BASE}/api/patients/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mobile: newMobile, password: "other1234", confirmPassword: "other1234", acceptTerms: true }) });
    check("…a second registration for it → 409", again.status === 409, `${again.status}`);
    const google = await mk({ name: "Google User", role: "PATIENT", email: `g${stamp}@example.com`, password: "", patientProfile: { create: { age: 0, gender: "" } } });
    const gReg = await fetch(`${BASE}/api/patients/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mobile: google.mobile, password: "secret123", confirmPassword: "secret123", acceptTerms: true }) });
    check("a Google account (has email) can't be taken over → 409", gReg.status === 409, `${gReg.status}`);

    // ── Pages ──
    const page = await fetch(`${BASE}/doctor/walk-in`, { headers: { Cookie: cookieFor(desk) }, redirect: "manual" });
    check("/doctor/walk-in opens for STAFF", page.status === 200, `${page.status}`);
    const payPage = await fetch(`${BASE}/pay/${onlineId}?t=${encodeURIComponent(token)}`, { redirect: "manual" });
    check("/pay/[id] opens signed out", payPage.status === 200, `${payPage.status}`);
  } finally {
    server?.kill("SIGTERM");
    mockServer.close();
    const all = [...ids, ...(await createdIds())];
    await prisma.paymentOrder.deleteMany({ where: { patientId: { in: all } } });
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: all } } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: all } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: all } }, { doctorId: { in: all } }] } });
    await prisma.staffProfile.deleteMany({ where: { OR: [{ userId: { in: all } }, { doctorId: { in: all } }] } });
    await prisma.clinic.deleteMany({ where: { doctorId: { in: all } } });
    await prisma.user.deleteMany({ where: { id: { in: all } } });
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
