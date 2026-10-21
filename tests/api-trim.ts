// Trimmed API responses (BUG-TRACKER #53): the public doctor endpoints send
// an allow-list of fields (home base to ~1 km), public reviews name the
// reviewer "Raj S.", /api/appointments/me and /api/appointments/[id] carry no
// gateway ids and no provider position once the visit isn't live (and
// finishing/cancelling a visit wipes it from the DB), and admin bookings never
// send the visit code; the list sends only the table's columns. Against a
// live dev server and the DB in .env, throwaway users only.
//
//   npm run test:api-trim
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
type Row = Record<string, unknown>;
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(as: U | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (as) headers.Cookie = cookieFor(as);
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as unknown };
}
const keys = (o: unknown) => Object.keys((o ?? {}) as Row).sort().join(",");
const has = (o: unknown, k: string) => Object.prototype.hasOwnProperty.call(o ?? {}, k);

const PROFILE_KEYS = [
  "photoUrl", "clinicName", "clinicPhotoUrl", "qualification", "medRegNo", "specialty", "experience", "consultFee", "videoFee",
  "homeVisitFee", "availability", "languages", "bio", "offersHomeVisit", "offersClinic", "offersVideo", "isVerified",
  "avgRating", "totalReviews", "radius", "lat", "lng",
].sort().join(",");
const CLINIC_KEYS = ["id", "name", "address", "photoUrl", "lat", "lng", "sortOrder", "slots"].sort().join(",");
const PRIVATE = ["bankDetails", "kycDocUrl", "medRegCertUrl", "degreeCertUrl", "signatureUrl", "cashfreeOrderId", "cashfreePaymentId", "trialEndsAt", "subscriptionPaidUntil", "status", "userId", "registrationFeePaid"];

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `4${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const admin = await mk({ name: "Trim Admin", role: "ADMIN" });
  const doctor = await mk({
    name: "Trim Doctor", role: "DOCTOR",
    doctorProfile: { create: {
      status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * 864e5),
      bankDetails: "ACC 1234567890 IFSC HDFC0001234", kycDocUrl: "https://example.com/kyc.pdf", cashfreeOrderId: "cf_order_secret",
      medRegNo: "MMC-555", lat: 18.523456, lng: 73.856789, offersHomeVisit: true,
    } },
  });
  await prisma.clinic.create({ data: { doctorId: doctor.id, name: "Trim Clinic", address: "1 FC Road, Pune", lat: 18.519876, lng: 73.841234, slots: { create: [{ dayOfWeek: "Mon", fromTime: "09:00", toTime: "13:00" }] } } });
  const patient = await mk({ name: "raj kumar sharma", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const patient2 = await mk({ name: "priya", role: "PATIENT", patientProfile: { create: { age: 28, gender: "Female" } } });

  const appt = (over: Record<string, unknown>) => prisma.appointment.create({ data: {
    doctorId: doctor.id, patientId: patient.id, symptoms: "fever", consultType: "CLINIC", status: "SCHEDULED", amount: 500, platformFee: 50,
    paymentMethod: "ONLINE", paymentStatus: "PAID", cashfreeOrderId: "order_secret_1", cashfreePaymentId: "pay_secret_1",
    scheduledAt: new Date(Date.now() - 3600_000), ...over,
  } as never });
  const live = { doctorLat: 18.51, doctorLng: 73.84, doctorLocationUpdatedAt: new Date() };

  try {
    // ── Public doctor endpoints ──
    const list = await call(null, "GET", "/api/doctors");
    const d = (list.json as Row[]).find((x) => x.id === doctor.id) as Row & { doctorProfile: Row; clinics: (Row & { slots: Row[] })[] };
    check("/api/doctors lists the doctor", list.status === 200 && !!d, `${list.status}`);
    check("…user fields are id, name, doctorProfile, clinics only", keys(d) === "clinics,doctorProfile,id,name", keys(d));
    check("…profile is exactly the public allow-list", keys(d.doctorProfile) === PROFILE_KEYS, keys(d.doctorProfile));
    check("…no bank / KYC / payment / subscription fields", PRIVATE.every((k) => !has(d.doctorProfile, k)), PRIVATE.filter((k) => has(d.doctorProfile, k)).join(",") || "none");
    check("…home base rounded to ~1 km", d.doctorProfile.lat === 18.52 && d.doctorProfile.lng === 73.86, `${d.doctorProfile.lat}, ${d.doctorProfile.lng}`);
    check("…clinics: public fields, exact coordinates, slots", keys(d.clinics[0]) === CLINIC_KEYS && d.clinics[0].lat === 18.519876 && keys(d.clinics[0].slots[0]) === "dayOfWeek,fromTime,id,toTime", `${keys(d.clinics[0])} · ${d.clinics[0].lat} · ${keys(d.clinics[0].slots[0])}`);
    const one = await call(null, "GET", `/api/doctors/${doctor.id}`);
    const o = one.json as Row & { doctorProfile: Row; clinics: Row[] };
    check("/api/doctors/[id]: same allow-list and rounding", one.status === 200 && keys(o.doctorProfile) === PROFILE_KEYS && o.doctorProfile.lat === 18.52 && keys(o.clinics[0]) === CLINIC_KEYS, `${one.status} ${keys(o.doctorProfile)} ${o.doctorProfile.lat}`);

    // ── Reviews ──
    const done1 = await appt({ status: "COMPLETED" });
    const done2 = await appt({ status: "COMPLETED", patientId: patient2.id });
    await prisma.review.createMany({ data: [
      { patientId: patient.id, doctorId: doctor.id, appointmentId: done1.id, rating: 5, comment: "Great" },
      { patientId: patient2.id, doctorId: doctor.id, appointmentId: done2.id, rating: 4, comment: null },
    ] });
    const rv = await call(null, "GET", `/api/doctors/${doctor.id}/reviews`);
    const reviews = rv.json as Row[];
    const names = reviews.map((r) => r.reviewer).sort().join(" | ");
    check("reviews: 'raj kumar sharma' → 'Raj S.', 'priya' → 'Priya'", names === "Priya | Raj S.", names);
    check("…no full name or patient id in the response", reviews.every((r) => keys(r) === "comment,createdAt,id,rating,reviewer") && !JSON.stringify(reviews).includes("sharma"), keys(reviews[0]));

    // ── /api/appointments/me + /api/appointments/[id] ──
    const pastWithPos = await prisma.appointment.update({ where: { id: done1.id }, data: { ...live, travelStatus: "ARRIVED", consultType: "HOME" } });
    const onTheWay = await appt({ consultType: "HOME", travelStatus: "ON_THE_WAY", visitOtp: "4321", scheduledAt: new Date(Date.now() + 3600_000), ...live });
    const me = await call(patient, "GET", "/api/appointments/me");
    const mine = me.json as Row[];
    const past = mine.find((a) => a.id === pastWithPos.id)!;
    const cur = mine.find((a) => a.id === onTheWay.id)!;
    check("patient /me: no gateway ids or internal accounting", mine.every((a) => !has(a, "cashfreeOrderId") && !has(a, "cashfreePaymentId") && !has(a, "settlementId") && !has(a, "visitOtpAttempts")) && !JSON.stringify(mine).includes("_secret_"), `${mine.length} rows`);
    check("…completed visit: provider position hidden (row still has one stored)", past.doctorLat === null && past.doctorLng === null && past.doctorLocationUpdatedAt === null, `${past.doctorLat}`);
    check("…visit on the way: position shown, visit code shown to the patient", cur.doctorLat === 18.51 && cur.visitOtp === "4321", `${cur.doctorLat} ${cur.visitOtp}`);
    let g = await call(patient, "GET", `/api/appointments/${pastWithPos.id}`);
    check("GET [id] completed: no position, no gateway ids", (g.json as Row).doctorLat === null && !has(g.json, "cashfreeOrderId") && !has(g.json, "cashfreePaymentId"), `${(g.json as Row).doctorLat}`);
    g = await call(patient, "GET", `/api/appointments/${onTheWay.id}`);
    check("GET [id] on the way: position for the track page", (g.json as Row).doctorLat === 18.51, `${(g.json as Row).doctorLat}`);
    const docMe = (await call(doctor, "GET", "/api/appointments/me")).json as Row[];
    check("doctor /me: no gateway ids, no visit code; settlement state kept", docMe.length >= 3 && docMe.every((a) => !has(a, "cashfreeOrderId") && !has(a, "cashfreePaymentId") && !has(a, "visitOtp") && has(a, "settlementId")), `${docMe.length} rows`);

    // ── Finishing / cancelling wipes the stored position ──
    const toComplete = await appt({ consultType: "VIDEO", ...live });
    let r = await call(doctor, "PATCH", `/api/appointments/${toComplete.id}`, { status: "COMPLETED" });
    let row = await prisma.appointment.findUniqueOrThrow({ where: { id: toComplete.id } });
    check("completing a visit clears the stored position", r.status === 200 && row.doctorLat === null && row.doctorLocationUpdatedAt === null, `${r.status} ${JSON.stringify((r.json as Row).error ?? "")} ${row.doctorLat}`);
    const toCancel = await appt({ consultType: "VIDEO", paymentMethod: "CASH", paymentStatus: "PENDING", cashfreeOrderId: null, cashfreePaymentId: null, scheduledAt: new Date(Date.now() + 48 * 3600_000), ...live });
    r = await call(patient, "PATCH", `/api/appointments/${toCancel.id}`, { status: "CANCELLED" });
    row = await prisma.appointment.findUniqueOrThrow({ where: { id: toCancel.id } });
    check("cancelling a visit clears the stored position", r.status === 200 && row.status === "CANCELLED" && row.doctorLat === null, `${r.status} ${JSON.stringify((r.json as Row).error ?? "")} ${row.status} ${row.doctorLat}`);

    // ── Admin bookings ──
    const longSymptoms = "headache ".repeat(40);
    const heavy = await appt({ symptoms: longSymptoms, doctorNotes: "Long private clinical notes", visitOtp: "9876", allergies: "penicillin", visitAddress: "Flat 4, Pune" });
    const al = await call(admin, "GET", "/api/admin/bookings");
    const rows = al.json as Row[];
    const h = rows.find((a) => a.id === heavy.id)!;
    check("admin list: only the table's columns", al.status === 200 && keys(h) === "amount,consultType,createdAt,doctor,id,patient,patientName,paymentMethod,paymentStatus,platformFee,providerType,relation,scheduledAt,status,symptoms", keys(h));
    check("…no visit code anywhere in the list", rows.every((a) => !has(a, "visitOtp")) && !JSON.stringify(rows).includes("9876"), "ok");
    check("…long symptoms cut to a preview", typeof h.symptoms === "string" && h.symptoms.length === 120 && h.symptoms.endsWith("…"), `${String(h.symptoms).length}`);
    const ad = await call(admin, "GET", `/api/admin/bookings/${heavy.id}`);
    const det = ad.json as Row;
    check("admin detail: full symptoms + notes, but no visit code or live position", ad.status === 200 && det.symptoms === longSymptoms && det.doctorNotes === "Long private clinical notes" && !has(det, "visitOtp") && !has(det, "visitOtpAttempts") && !has(det, "doctorLat"), keys(det).slice(0, 80));
    check("a patient can't read admin bookings (403)", (await call(patient, "GET", "/api/admin/bookings")).status === 403, "ok");
  } finally {
    await prisma.review.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } }).catch(() => {});
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
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
