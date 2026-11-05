// Lab tests: the admin catalogue (B2B price + commission → final price,
// seeded from the B2B price list), the doctor's prescription tests linking to
// it, and the patient booking → admin status flow, with wallet payment and
// refund races. Pure checks, then API checks against a live dev server and
// the DB in .env — throwaway users only; the one catalogue test it adds is
// deleted again.
//
//   npm run test:lab-tests
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { DEFAULT_LAB_TESTS, LAB_ALIASES, labTestKey, labTestPrice, parseLabTestInput, resolveLabTest } from "../src/lib/labTests";
import { createLabBooking, settleLabPayment, labOrderId } from "../src/lib/labBookings";
import { collectionDays, collectionSlotProblem, labShareText, openSlots, slotLabel } from "../src/lib/labShare";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const HOUR = 60 * 60_000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string | null; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
type Json = Record<string, unknown> & { error?: string; code?: string };
async function call(u: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Cookie: cookieFor(u), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

async function main() {
  // ── Pure rules ──
  check("₹140 + 50% → ₹210", labTestPrice({ b2bPrice: 140, commissionPercent: 50 }) === 210, String(labTestPrice({ b2bPrice: 140, commissionPercent: 50 })));
  check("₹75 + 50% → ₹113 (rounded)", labTestPrice({ b2bPrice: 75, commissionPercent: 50 }) === 113, String(labTestPrice({ b2bPrice: 75, commissionPercent: 50 })));
  check("₹199 + 0% → ₹199", labTestPrice({ b2bPrice: 199, commissionPercent: 0 }) === 199, "ok");
  check("price list has all 153 tests", DEFAULT_LAB_TESTS.length === 153, String(DEFAULT_LAB_TESTS.length));
  check("price list names are unique", new Set(DEFAULT_LAB_TESTS.map(([n]) => labTestKey(n))).size === DEFAULT_LAB_TESTS.length, "ok");
  const created = parseLabTestInput({ name: "  Lipid   X ", b2bPrice: "120" }, true);
  check("create: commission defaults to 50%, name tidied", "data" in created && created.data.commissionPercent === 50 && created.data.name === "Lipid X", JSON.stringify(created));
  for (const [label, body] of [["no name", { b2bPrice: 10 }], ["zero price", { name: "A", b2bPrice: 0 }], ["blank price", { name: "A", b2bPrice: "" }], ["negative commission", { name: "A", b2bPrice: 10, commissionPercent: -1 }]] as const) {
    check(`create rejects ${label}`, "error" in parseLabTestInput(body, true), "error");
  }

  // Old/free-text prescription names → catalogue (conservative: ambiguous → none).
  const cat = DEFAULT_LAB_TESTS.map(([name]) => ({ name }));
  for (const [written, want] of [
    ["CBC", "Complete Hemogram (CBC)"], ["Dengue NS1 antigen", "Dengue NS1 Antigen Detection - Rapid Card"], ["LFT", "Liver Function Test"],
    ["Thyroid Profile (T3 T4 TSH)", "Thyroid Profile-Total (T3, T4 & TSH Ultra-sensitive)"], ["Blood Sugar (Fasting)", "Blood Glucose Fasting"],
    ["vitamin d", "Vitamin D Total -25 Hydroxy"], ["AMH", "AMH (Mullerian Inhibiting Substances)-ELISA, Serum"], ["CA-125", "CA-125, Serum"], ["hba1c", "HbA1C"],
    ["Chest X-ray PA view", null], ["ECG", null], ["T4", null], ["Dengue", null], ["Hepatitis", null],
  ] as [string, string | null][]) {
    const got = resolveLabTest(written, cat)?.name ?? null;
    check(`"${written}" → ${want ?? "no match"}`, got === want, String(got));
  }
  check("every alias points at a price-list test", Object.values(LAB_ALIASES).every((n) => cat.some((c) => c.name === n)), "ok");

  // Collection slots + the WhatsApp hand-off text.
  const noon = new Date("2026-11-05T12:30:00+05:30");
  check("7–9 AM label", slotLabel("07-09") === "7 AM – 9 AM" && slotLabel("13-15") === "1 PM – 3 PM", slotLabel("13-15"));
  check("today at 12:30 → slots from 3 PM on", JSON.stringify(openSlots("2026-11-05", noon)) === JSON.stringify(["15-17", "17-19"]), JSON.stringify(openSlots("2026-11-05", noon)));
  check("past slot today refused", collectionSlotProblem("2026-11-05", "09-11", noon) !== null, "refused");
  check("tomorrow 9–11 ok", collectionSlotProblem("2026-11-06", "09-11", noon) === null, "ok");
  check("8 days ahead refused", collectionSlotProblem("2026-11-13", "09-11", noon) !== null, "refused");
  check("unknown slot refused", collectionSlotProblem("2026-11-06", "08-10", noon) !== null, "refused");
  const share = labShareText({
    patientName: "Raj Sharma", patientAge: 34, patientGender: "Male", mobile: "9876543210",
    tests: ["Complete Hemogram (CBC)", "Lipid Profile"], address: "12 MG Road, Kothrud, Pune", pinCode: "411038", lat: 18.507399, lng: 73.807648,
    collectionDate: "2026-11-06", collectionSlot: "07-09",
  });
  const want = [
    "Full Name: Raj Sharma", "Age: 34", "Gender: Male", "Phone number: +91 98765 43210", "",
    "Tests:", "1. Complete Hemogram (CBC)", "2. Lipid Profile", "",
    "Address with Pincode: 12 MG Road, Kothrud, Pune - 411038",
    "Coordinates: 18.507399, 73.807648", "Map: https://www.google.com/maps/search/?api=1&query=18.507399,73.807648",
    "", "Time slot: Fri, 6 Nov 2026, 7 AM – 9 AM",
  ].join("\n");
  check("WhatsApp share text in the lab's format", share === want, JSON.stringify(share));
  check("PIN not repeated when the address already ends with it", labShareText({ patientName: "A", patientAge: null, patientGender: null, mobile: "x", tests: [], address: "Pune 411038", pinCode: "411038", collectionDate: null, collectionSlot: null }).includes("Address with Pincode: Pune 411038\n"), "ok");

  // ── API ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `8${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const doctor = await mk({
    name: "Lab Doctor", role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 24 * HOUR), qualification: "MBBS", medRegNo: `LAB${stamp}` } },
  });
  const admin = await mk({ name: "Lab Admin", role: "ADMIN" });
  const patient = await mk({ name: "Lab Patient", role: "PATIENT", patientProfile: { create: { age: 40, gender: "Male", homeAddress: "12 Test Lane, Pune", pinCode: "411001" } } });
  const stranger = await mk({ name: "Lab Stranger", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Female" } } });
  const newTestName = `ZZ Lab Test ${stamp}`;
  let newTestId = "";
  const wallet = await prisma.wallet.create({ data: { userId: patient.id, balance: 0 } });
  const balance = async () => (await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance;
  const appt = (status: string, extra: Record<string, unknown> = {}) =>
    prisma.appointment.create({
      data: { doctorId: doctor.id, patientId: patient.id, status, scheduledAt: new Date(Date.now() - HOUR), symptoms: "fever", amount: 500, consultType: "VIDEO", paymentMethod: "CASH", ...extra } as never,
    });

  try {
    // Catalogue — seeded, admin-only, computed price.
    let r = await call(admin, "GET", "/api/admin/lab-tests");
    const list = r.json as unknown as { id: string; name: string; b2bPrice: number; commissionPercent: number; finalPrice: number }[];
    check("admin catalogue loads", r.status === 200 && Array.isArray(list), String(r.status));
    const tsh = list.find((t) => t.name === "TSH Ultra Sensitive");
    check("seeded: TSH Ultra Sensitive ₹140 + 50% = ₹210", tsh?.b2bPrice === 140 && tsh.commissionPercent === 50 && tsh.finalPrice === 210, JSON.stringify(tsh));
    check("seeded: whole price list present", DEFAULT_LAB_TESTS.every(([name]) => list.some((t) => t.name === name)), `${list.length} rows`);
    const lipid = list.find((t) => t.name === "Lipid Profile")!;
    check("patient can't read the admin catalogue", (await call(patient, "GET", "/api/admin/lab-tests")).status === 403, "403");
    check("doctor can't add tests", (await call(doctor, "POST", "/api/admin/lab-tests", { name: "X", b2bPrice: 10 })).status === 403, "403");

    r = await call(admin, "POST", "/api/admin/lab-tests", { name: newTestName, b2bPrice: 100 });
    newTestId = String(r.json.id ?? "");
    check("admin adds a test → default 50% → ₹150", r.status === 200 && r.json.commissionPercent === 50 && r.json.finalPrice === 150, `${r.status} ${JSON.stringify(r.json)}`);
    r = await call(admin, "POST", "/api/admin/lab-tests", { name: newTestName.toUpperCase(), b2bPrice: 100 });
    check("duplicate name (any case) → 409", r.status === 409, `${r.status} ${r.json.error}`);
    r = await call(admin, "PATCH", `/api/admin/lab-tests/${newTestId}`, { commissionPercent: 20 });
    check("edit commission 20% → final ₹120", r.status === 200 && r.json.finalPrice === 120, `${r.status} ${JSON.stringify(r.json)}`);
    r = await call(admin, "PATCH", `/api/admin/lab-tests/${newTestId}`, { b2bPrice: -5 });
    check("negative B2B price → 400", r.status === 400, String(r.status));

    r = await call(doctor, "GET", "/api/lab-tests");
    const docList = r.json as unknown as { id: string; name: string; price: number }[];
    const docNew = docList.find((t) => t.id === newTestId);
    check("doctor sees the active catalogue with patient price", r.status === 200 && docNew?.price === 120, JSON.stringify(docNew));
    check("doctor's list hides B2B price and commission", !!docNew && !("b2bPrice" in docNew) && !("commissionPercent" in docNew), JSON.stringify(docNew));
    check("patient can't read the doctor catalogue", (await call(patient, "GET", "/api/lab-tests")).status === 403, "403");

    // Prescription → linked to the catalogue by name.
    const a = await appt("SCHEDULED");
    r = await call(doctor, "POST", `/api/appointments/${a.id}/prescription-items`, {
      medicines: [],
      tests: [{ name: newTestName.toLowerCase(), instructions: "Fasting" }, { name: "lipid  profile" }, { name: "X-Ray Chest" }],
    });
    check("doctor saves tests → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    const rows = await prisma.prescriptionTest.findMany({ where: { appointmentId: a.id } });
    check("catalogue test linked (case-insensitive)", rows.find((x) => x.name === newTestName.toLowerCase())?.labTestId === newTestId, "linked");
    check("'lipid  profile' linked to Lipid Profile", rows.find((x) => x.name === "lipid  profile")?.labTestId === lipid.id, "linked");
    check("X-Ray (not in catalogue) stays unlinked", rows.find((x) => x.name === "X-Ray Chest")?.labTestId === null, "null");

    // Booking needs a completed consultation, the patient's own.
    r = await call(patient, "GET", `/api/lab-bookings/quote?appointmentId=${a.id}`);
    check("quote before completion → 409 NOT_COMPLETED", r.status === 409 && r.json.code === "NOT_COMPLETED", `${r.status} ${r.json.code}`);
    await prisma.appointment.update({ where: { id: a.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    r = await call(stranger, "GET", `/api/lab-bookings/quote?appointmentId=${a.id}`);
    check("another patient's consultation → 404", r.status === 404, String(r.status));
    r = await call(patient, "GET", `/api/lab-bookings/quote?appointmentId=${a.id}`);
    const quote = r.json as unknown as { tests: { name: string; labTest: { id: string; price: number } | null }[]; defaultAddress: string; walletBalance: number };
    const expectedTotal = 120 + labTestPrice(lipid);
    check("quote: 2 bookable, X-Ray not", r.status === 200 && quote.tests.filter((t) => t.labTest).length === 2 && !quote.tests.find((t) => t.name === "X-Ray Chest")?.labTest, JSON.stringify(quote.tests));
    check("quote: address + PIN prefilled from profile", quote.defaultAddress === "12 Test Lane, Pune" && (quote as unknown as { defaultPinCode: string }).defaultPinCode === "411001", `${quote.defaultAddress} / ${(quote as unknown as { defaultPinCode: string }).defaultPinCode}`);

    const feed = await call(patient, "GET", "/api/appointments/me?view=history");
    const feedAppt = ((feed.json.items ?? []) as { id: string; tests?: { name: string; bookable: boolean }[] }[]).find((x) => x.id === a.id);
    check("appointments feed marks bookable tests", feedAppt?.tests?.filter((t) => t.bookable).length === 2, JSON.stringify(feedAppt?.tests));

    const body = { appointmentId: a.id, labTestIds: [newTestId, lipid.id], address: "12 Test Lane, Pune", pinCode: "411001", lat: 18.5204, lng: 73.8567, collectionDate: collectionDays()[1], collectionSlot: "09-11", notes: "Morning", paymentMethod: "WALLET" };
    r = await call(patient, "POST", "/api/lab-bookings", body);
    check("wallet ₹0 → 409 INSUFFICIENT_BALANCE", r.status === 409 && r.json.code === "INSUFFICIENT_BALANCE", `${r.status} ${r.json.code}`);
    check("…and no booking left behind", (await prisma.labBooking.count({ where: { appointmentId: a.id } })) === 0, "0");
    r = await call(patient, "POST", "/api/lab-bookings", { ...body, labTestIds: ["not-a-test"] });
    check("a test not on the prescription → 409", r.status === 409 && r.json.code === "TEST_UNAVAILABLE", `${r.status} ${r.json.code}`);
    r = await call(patient, "POST", "/api/lab-bookings", { ...body, address: "" });
    check("no address → 400", r.status === 400, String(r.status));
    r = await call(patient, "POST", "/api/lab-bookings", { ...body, pinCode: "41100" });
    check("bad PIN code → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(patient, "POST", "/api/lab-bookings", { ...body, lat: undefined, lng: undefined });
    check("no map pin → 400", r.status === 400 && /Pin your exact location/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    r = await call(patient, "POST", "/api/lab-bookings", { ...body, lat: 51.5, lng: -0.12 });
    check("pin outside India → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await call(patient, "POST", "/api/lab-bookings", { ...body, collectionSlot: undefined });
    check("no time slot → 400", r.status === 400, `${r.status} ${r.json.error}`);

    await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 1000 } });
    // Two taps at once: exactly one booking, one debit.
    const [p1, p2] = await Promise.all([call(patient, "POST", "/api/lab-bookings", body), call(patient, "POST", "/api/lab-bookings", body)]);
    const ok = [p1, p2].filter((x) => x.status === 200);
    check("double tap → exactly one booking", ok.length === 1 && [p1, p2].some((x) => x.status === 409 && x.json.code === "ALREADY_BOOKED"), `${p1.status} ${p2.status}`);
    const booking = ok[0]?.json as { id: string; totalAmount: number; paymentStatus: string; items: Record<string, unknown>[] } | undefined;
    check(`booked at final prices: ₹${expectedTotal}`, booking?.totalAmount === expectedTotal && booking.paymentStatus === "PAID", JSON.stringify(booking && { total: booking.totalAmount, ps: booking.paymentStatus }));
    check("wallet debited once", (await balance()) === 1000 - expectedTotal, String(await balance()));
    check("patient view hides B2B price", !!booking && booking.items.every((i) => !("b2bPrice" in i) && !("commissionPercent" in i)), "hidden");
    const bookingId = booking?.id ?? "";
    const snap = await prisma.labBooking.findUniqueOrThrow({ where: { id: bookingId } });
    check("age, gender, PIN and slot saved with the booking", snap.patientAge === 40 && snap.patientGender === "Male" && snap.pinCode === "411001" && snap.collectionSlot === "09-11" && snap.collectionDate === collectionDays()[1] && snap.lat === 18.5204 && snap.lng === 73.8567, JSON.stringify({ a: snap.patientAge, g: snap.patientGender, p: snap.pinCode, s: snap.collectionSlot }));
    r = await call(admin, "PATCH", `/api/admin/lab-bookings/${bookingId}`, { collectionDate: collectionDays()[2], collectionSlot: "15-17" });
    const slotRow = await prisma.labBooking.findUniqueOrThrow({ where: { id: bookingId } });
    check("admin can't change the patient's slot", r.status === 400 && slotRow.collectionSlot === "09-11" && slotRow.collectionDate === collectionDays()[1], `${r.status} ${slotRow.collectionSlot}`);

    // Admin moves it along; the patient sees it.
    r = await call(admin, "GET", "/api/admin/lab-bookings?status=REQUESTED");
    check("admin list (REQUESTED) has it", ((r.json.bookings ?? []) as { id: string }[]).some((b) => b.id === bookingId), String(r.status));
    check("patient can't use the admin list", (await call(patient, "GET", "/api/admin/lab-bookings")).status === 403, "403");
    r = await call(admin, "PATCH", `/api/admin/lab-bookings/${bookingId}`, { status: "CONFIRMED", adminNote: "Collection tomorrow 8 AM" });
    check("admin → CONFIRMED + note", r.status === 200 && r.json.status === "CONFIRMED", `${r.status} ${r.json.error ?? ""}`);
    r = await call(admin, "PATCH", `/api/admin/lab-bookings/${bookingId}`, { status: "BOGUS" });
    check("invalid status → 400", r.status === 400, String(r.status));
    r = await call(patient, "GET", "/api/lab-bookings");
    const mine = ((r.json as unknown as { id: string; status: string; adminNote: string }[]) ?? []).find((b) => b.id === bookingId);
    check("patient sees status + admin note", mine?.status === "CONFIRMED" && mine.adminNote === "Collection tomorrow 8 AM", JSON.stringify(mine && { s: mine.status, n: mine.adminNote }));
    r = await call(patient, "POST", `/api/lab-bookings/${bookingId}/cancel`);
    check("patient can't cancel once confirmed", r.status === 409, String(r.status));
    r = await call(stranger, "POST", `/api/lab-bookings/${bookingId}/cancel`);
    check("another patient can't cancel it", r.status === 404, String(r.status));
    r = await call(admin, "PATCH", `/api/admin/lab-bookings/${bookingId}`, { paymentStatus: "PAID" });
    check("admin can't set payment by hand", r.status === 400, String(r.status));
    r = await call(admin, "PATCH", `/api/admin/lab-bookings/${bookingId}`, { status: "SAMPLE_COLLECTED" });
    check("admin → SAMPLE_COLLECTED", r.status === 200 && r.json.status === "SAMPLE_COLLECTED", String(r.status));

    // Admin cancels → refund once, even when sent twice at once.
    const [c1, c2] = await Promise.all([
      call(admin, "PATCH", `/api/admin/lab-bookings/${bookingId}`, { status: "CANCELLED" }),
      call(admin, "PATCH", `/api/admin/lab-bookings/${bookingId}`, { status: "CANCELLED" }),
    ]);
    check("double admin cancel → one 200", [c1, c2].filter((x) => x.status === 200).length === 1, `${c1.status} ${c2.status}`);
    check("refunded to wallet once", (await balance()) === 1000, String(await balance()));
    const ledger = await prisma.walletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "asc" } });
    check("ledger: one LAB_TEST_PAYMENT + one LAB_TEST_REFUND", ledger.length === 2 && ledger[0].type === "LAB_TEST_PAYMENT" && ledger[1].type === "LAB_TEST_REFUND" && ledger[1].refundOfLabBookingId === bookingId, ledger.map((l) => l.type).join(","));
    r = await call(admin, "PATCH", `/api/admin/lab-bookings/${bookingId}`, { status: "CONFIRMED" });
    check("cancelled is final", r.status === 409, String(r.status));

    // Rebook (the cancelled one doesn't block), patient cancels twice at once.
    r = await call(patient, "POST", "/api/lab-bookings", body);
    const second = r.json as { id: string };
    check("rebook after cancel → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    const [x1, x2] = await Promise.all([call(patient, "POST", `/api/lab-bookings/${second.id}/cancel`), call(patient, "POST", `/api/lab-bookings/${second.id}/cancel`)]);
    check("double patient cancel → one 200", [x1, x2].filter((x) => x.status === 200).length === 1, `${x1.status} ${x2.status}`);
    check("…refunded once", (await balance()) === 1000, String(await balance()));

    // No cash for lab tests.
    r = await call(patient, "POST", "/api/lab-bookings", { ...body, paymentMethod: "CASH" });
    check("CASH → 400", r.status === 400, `${r.status} ${r.json.error}`);

    // Report: admin uploads (real S3), patient sees it, it's in the vault, booking completes.
    r = await call(patient, "POST", "/api/lab-bookings", { ...body, labTestIds: [lipid.id] });
    const rep = r.json as { id: string };
    check("wallet booking for the report flow → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    const upload = async (u: U, files: { name: string; type: string; bytes: string }[]) => {
      const form = new FormData();
      for (const f of files) form.append("file", new Blob([f.bytes], { type: f.type }), f.name);
      const res = await fetch(`${BASE}/api/admin/lab-bookings/${rep.id}/reports`, { method: "POST", headers: { Cookie: cookieFor(u) }, body: form });
      return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
    };
    const pdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
    check("patient can't upload a report", (await upload(patient, [{ name: "r.pdf", type: "application/pdf", bytes: pdf }])).status === 403, "403");
    r = await upload(admin, [{ name: "fake.pdf", type: "application/pdf", bytes: "just text, not a pdf" }]);
    check("a fake PDF is refused", r.status === 400, `${r.status} ${r.json.error}`);
    r = await upload(admin, [{ name: "Lipid report.pdf", type: "application/pdf", bytes: pdf }]);
    const reports = (r.json.reports ?? []) as { id: string; fileUrl: string; fileName: string }[];
    check("admin uploads the report → booking COMPLETED", r.status === 200 && r.json.status === "COMPLETED" && reports.length === 1, `${r.status} ${r.json.error ?? r.json.status}`);
    const reportUrl = reports[0]?.fileUrl ?? "";
    check("stored in our S3 bucket", reportUrl.includes(".amazonaws.com/lab-reports/"), reportUrl);
    const s3 = reportUrl ? await fetch(reportUrl) : null;
    check("the file is really there", s3?.status === 200 && (await s3.text()).startsWith("%PDF"), String(s3?.status));
    r = await call(patient, "GET", "/api/lab-bookings");
    const seen = ((r.json as unknown as { id: string; reports: { fileUrl: string }[] }[]) ?? []).find((x) => x.id === rep.id);
    check("patient sees the report", seen?.reports.length === 1 && seen.reports[0].fileUrl === reportUrl, JSON.stringify(seen?.reports));
    const vault = await prisma.patientDocument.findFirst({ where: { patientId: patient.id, fileUrl: reportUrl } });
    check("filed in the patient's vault as a Lab Report", vault?.category === "Lab Report" && vault.title.includes("Lipid Profile"), JSON.stringify(vault && { c: vault.category, t: vault.title }));
    r = await call(admin, "PATCH", `/api/admin/lab-bookings/${rep.id}`, { status: "CANCELLED" });
    check("completed can't be cancelled", r.status === 409, String(r.status));
    r = await call(admin, "DELETE", `/api/admin/lab-bookings/${rep.id}/reports/${reports[0]?.id}`);
    check("admin deletes the report", r.status === 200, String(r.status));
    check("…gone from the vault too", (await prisma.patientDocument.count({ where: { fileUrl: reportUrl } })) === 0, "0");
    const after = reportUrl ? await fetch(reportUrl) : null;
    check("…and from S3", !!after && after.status !== 200, String(after?.status));

    // Online: unpaid until Cashfree confirms (settled here directly — the
    // webhook/verify paths run against a mock gateway in test:lab-payments).
    const c = await appt("COMPLETED", { completedAt: new Date() });
    await prisma.prescriptionTest.create({ data: { appointmentId: c.id, name: "CBC" } });
    r = await call(patient, "GET", `/api/lab-bookings/quote?appointmentId=${c.id}`);
    const cbc = ((r.json.tests ?? []) as { labTest: { id: string; name: string; price: number } | null }[])[0]?.labTest;
    check("legacy 'CBC' prescription row is bookable as Complete Hemogram (CBC)", cbc?.name === "Complete Hemogram (CBC)", JSON.stringify(cbc));
    const online = await createLabBooking(patient.id, { appointmentId: c.id, labTestIds: [cbc!.id], address: "12 Test Lane, Pune", pinCode: "411001", lat: 18.5204, lng: 73.8567, collectionDate: collectionDays()[1], collectionSlot: "09-11", notes: null, paymentMethod: "ONLINE" });
    check("online booking starts PENDING_PAYMENT", online.status === "PENDING_PAYMENT" && online.paymentStatus === "PENDING", online.status);
    r = await call(admin, "PATCH", `/api/admin/lab-bookings/${online.id}`, { status: "CONFIRMED" });
    check("admin can't move an unpaid booking", r.status === 409, String(r.status));
    r = await call(admin, "GET", "/api/admin/lab-bookings?status=REQUESTED");
    check("unpaid booking isn't in the admin's Requested list", !((r.json.bookings ?? []) as { id: string }[]).some((x) => x.id === online.id), "absent");
    const order = labOrderId(online.id);
    const before = await balance();
    const s1 = await settleLabPayment({ orderId: order, amount: online.totalAmount, cfPaymentId: `cf_${stamp}_1` });
    const paidRow = await prisma.labBooking.findUniqueOrThrow({ where: { id: online.id } });
    check("payment settles → REQUESTED + PAID", s1.outcome === "paid" && paidRow.status === "REQUESTED" && paidRow.paymentStatus === "PAID", `${s1.outcome} ${paidRow.status}`);
    const s2 = await settleLabPayment({ orderId: order, amount: online.totalAmount, cfPaymentId: `cf_${stamp}_1` });
    check("same payment again → no-op", s2.outcome === "retry" && (await balance()) === before, s2.outcome);
    const s3b = await settleLabPayment({ orderId: labOrderId(online.id), amount: online.totalAmount, cfPaymentId: `cf_${stamp}_2` });
    check("a second payment → whole amount to the wallet", s3b.outcome === "credited" && (await balance()) === before + online.totalAmount, `${s3b.outcome} ${await balance()}`);
    r = await call(patient, "POST", `/api/lab-bookings/${online.id}/cancel`);
    check("patient cancels a paid online booking → refunded to wallet", r.status === 200 && r.json.refunded === online.totalAmount && (await balance()) === before + 2 * online.totalAmount, `${r.status} ${r.json.refunded}`);

    // Hidden tests can't be booked; deleting keeps the booking's copy.
    const b = await appt("COMPLETED", { completedAt: new Date() });
    await prisma.prescriptionTest.create({ data: { appointmentId: b.id, name: newTestName, labTestId: newTestId } });
    await call(admin, "PATCH", `/api/admin/lab-tests/${newTestId}`, { isActive: false });
    r = await call(patient, "GET", `/api/lab-bookings/quote?appointmentId=${b.id}`);
    check("hidden test → not bookable", r.status === 200 && (r.json.tests as { labTest: unknown }[])[0]?.labTest === null, JSON.stringify(r.json.tests));
    await call(admin, "PATCH", `/api/admin/lab-tests/${newTestId}`, { isActive: true });
    r = await call(patient, "POST", "/api/lab-bookings", { ...body, appointmentId: b.id, labTestIds: [newTestId] });
    const kept = r.json as { id: string };
    r = await call(admin, "DELETE", `/api/admin/lab-tests/${newTestId}`);
    check("admin deletes a booked test → 200", r.status === 200, String(r.status));
    const item = await prisma.labBookingItem.findFirst({ where: { bookingId: kept.id } });
    check("booking keeps the test name and price", item?.name === newTestName && item.price === 120 && item.labTestId === null, JSON.stringify(item && { n: item.name, p: item.price }));
    newTestId = "";
  } finally {
    await prisma.labBooking.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.patientDocument.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    if (newTestId) await prisma.labTest.delete({ where: { id: newTestId } }).catch(() => null);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll lab test checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
