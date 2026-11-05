// Lab tests, end to end in a real browser, the way each person uses it:
//   admin   — sees the seeded catalogue, adds a test, edits its commission;
//   doctor  — completes a visit from the dashboard, prescribing "CBC" + the new test
//             (the editor shows they're bookable, with the patient price);
//   patient — opens Appointments, taps "Book lab tests", pins the home on the map
//             with GPS, picks PIN / day / slot, pays online (Cashfree checkout
//             stubbed in the browser + mock gateway) and lands back on My lab tests;
//   admin   — sees the paid request, checks the WhatsApp hand-off text (name, age,
//             gender, phone, tests, address + PIN, coordinates, slot), confirms it
//             with a note, uploads the report PDF (real S3);
//   patient — sees Completed + the note + the report, downloads it, finds it in the
//             records vault and the inbox.
// Starts its OWN dev server (own distDir/port; the owner's `next dev` is left
// alone) with a mock Cashfree and Firebase switched off. Throwaway users; the
// added catalogue test and the uploaded report are deleted afterwards.
// Screenshots: /tmp/lab-e2e/*.png
//
//   npm run test:lab-e2e
import "dotenv/config";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import type { ChildProcess } from "child_process";
import jwt from "jsonwebtoken";
import { chromium, type BrowserContext, type Page } from "playwright";
import { prisma } from "../src/lib/prisma";
import { startDevServer } from "./devServer";
import { deleteFromS3 } from "../src/lib/s3";

let BASE = "";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const SHOTS = "/tmp/lab-e2e";
const HOME = { latitude: 18.507399, longitude: 73.807648 }; // Kothrud, Pune
const HOUR = 60 * 60_000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

// ── Mock Cashfree (server side) ──
const mock = {
  orders: new Map<string, { amount: number; returnUrl: string }>(),
  payments: new Map<string, { cf_payment_id: string; payment_status: string; payment_amount: number }[]>(),
};
const mockServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/orders") {
      const o = JSON.parse(body);
      mock.orders.set(o.order_id, { amount: o.order_amount, returnUrl: o.order_meta?.return_url });
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

// The browser half: Cashfree.js replaced by a stub whose checkout() goes to a
// fake gateway page; that "pays" (the mock gateway now reports a SUCCESS
// payment) and sends the patient to the order's return URL, as Cashfree would.
const FAKE_SDK = `window.Cashfree = function () { return { checkout: function (o) { location.href = "/__fake_gateway?s=" + encodeURIComponent(o.paymentSessionId); } }; };`;
async function stubGateway(ctx: BrowserContext) {
  await ctx.route("https://sdk.cashfree.com/**", (route) => route.fulfill({ contentType: "application/javascript", body: FAKE_SDK }));
  await ctx.route("**/__fake_gateway**", (route) => {
    const session = new URL(route.request().url()).searchParams.get("s") ?? "";
    const orderId = session.replace(/^sess_/, "");
    const order = mock.orders.get(orderId);
    if (!order) return route.fulfill({ status: 404, body: "unknown session" });
    mock.payments.set(orderId, [{ cf_payment_id: `e2e_${orderId}`, payment_status: "SUCCESS", payment_amount: order.amount }]);
    return route.fulfill({ status: 302, headers: { location: order.returnUrl } });
  });
}

type U = { id: string; name: string | null; role: string; mobile: string };
async function contextFor(browser: import("playwright").Browser, u: U, opts: { mobile?: boolean } = {}) {
  const ctx = await browser.newContext({
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    isMobile: !!opts.mobile,
    hasTouch: !!opts.mobile,
    geolocation: HOME,
    permissions: ["geolocation"],
    acceptDownloads: true,
    locale: "en-IN",
  });
  const host = new URL(BASE).hostname;
  await ctx.addCookies([
    { name: "doconclick_token", value: jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET), domain: host, path: "/" },
    { name: "doconclick_lang", value: "en-IN", domain: host, path: "/" },
  ]);
  await stubGateway(ctx);
  ctx.setDefaultNavigationTimeout(180_000);
  ctx.setDefaultTimeout(60_000);
  return ctx;
}
const shot = (p: Page, name: string) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
async function step<T>(label: string, p: Page, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    check(label, false, (err as Error).message.split("\n").slice(0, 4).join(" | "));
    await shot(p, `FAILED-${label.replace(/[^a-z0-9]+/gi, "-").slice(0, 50)}`);
    return null;
  }
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(`${SHOTS}/${f}`);
  await new Promise<void>((r) => mockServer.listen(0, "127.0.0.1", r));
  const mockPort = (mockServer.address() as AddressInfo).port;

  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `9${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const admin = await mk({ name: "E2E Admin", role: "ADMIN" });
  const doctor = await mk({
    name: "Dr. E2E Kulkarni", role: "DOCTOR",
    doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, specialty: "General Physician", trialEndsAt: new Date(Date.now() + 30 * 24 * HOUR), qualification: "MBBS", medRegNo: `E2E${stamp}` } },
  });
  const patient = await mk({
    name: "Sunita Joshi", role: "PATIENT",
    patientProfile: { create: { age: 45, gender: "Female", homeAddress: "Flat 7, Shanti Apartments, Karve Road, Kothrud, Pune", pinCode: "411038", lat: 18.5, lng: 73.8 } },
  });
  const testName = `E2E Vitamin Panel ${stamp}`;
  let labTestId = "";
  const visit = await prisma.appointment.create({
    data: { doctorId: doctor.id, patientId: patient.id, status: "SCHEDULED", scheduledAt: new Date(Date.now() - 10 * 60_000), symptoms: "Fever and body ache for 3 days", amount: 400, consultType: "VIDEO", paymentMethod: "CASH" } as never,
  });

  let server: ChildProcess | null = null;
  const browser = await chromium.launch();
  try {
    const started = await startDevServer({
      label: "lab-e2e",
      env: {
        CASHFREE_API_BASE: `http://127.0.0.1:${mockPort}`, CASHFREE_APP_ID: "test-app", CASHFREE_SECRET_KEY: "test-only",
        FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "",
      },
    });
    server = started.child;
    BASE = started.base;
    // A fresh dev server compiles each page on first hit — warm them up so the
    // steps below time the app, not the compiler.
    for (const path of ["/admin/lab-tests", "/admin/lab-bookings", "/doctor/dashboard", "/patient/appointments", "/patient/lab-tests", "/patient/lab-tests/book", "/patient/profile/documents", "/api/lab-tests", "/api/lab-bookings", "/api/appointments/me?view=active", "/api/admin/lab-bookings", "/api/files/download", "/api/patients/me/documents"]) {
      await fetch(`${BASE}${path}`, { redirect: "manual" }).catch(() => null);
    }
    for (const [method, path] of [["PATCH", "/api/admin/lab-bookings/x"], ["POST", "/api/admin/lab-bookings/x/reports"], ["POST", "/api/lab-bookings/x/verify"], ["POST", "/api/appointments/x/complete"]]) {
      await fetch(`${BASE}${path}`, { method }).catch(() => null);
    }

    // ── 1. Admin: catalogue ──
    const adminCtx = await contextFor(browser, admin);
    const ap = await adminCtx.newPage();
    await step("admin catalogue", ap, async () => {
      await ap.goto(`${BASE}/admin/lab-tests`);
      await ap.getByRole("heading", { name: "Lab Tests" }).waitFor({ timeout: 60_000 });
      await ap.getByPlaceholder("Search tests").fill("Lipid Profile");
      const row = ap.locator("tr", { hasText: "Lipid Profile" }).first();
      const text = await row.innerText();
      check("admin sees seeded Lipid Profile: ₹199 + 50% = ₹299", /₹199/.test(text) && /50%/.test(text) && /₹299/.test(text), text.replace(/\s+/g, " "));
      await ap.getByPlaceholder("Search tests").fill("");
      await ap.getByRole("button", { name: "Add test" }).first().click();
      await ap.getByPlaceholder("e.g. Lipid Profile").fill(testName);
      const inputs = ap.locator("input[type=number]");
      await inputs.nth(0).fill("400");
      check("final price previews before saving (₹400 + 50% default)", (await ap.getByText("Final price for patients:").innerText()).includes("₹600"), await ap.getByText("Final price for patients:").innerText());
      await shot(ap, "01-admin-add-test");
      await ap.getByRole("button", { name: "Add test" }).last().click();
      await ap.getByPlaceholder("Search tests").fill(testName);
      const added = ap.locator("tr", { hasText: testName });
      await added.waitFor();
      await added.getByTitle("Edit").click();
      const edit = ap.locator("tr", { has: ap.locator("input") }).first();
      await edit.locator("input[type=number]").nth(1).fill("25");
      await edit.getByTitle("Save").click();
      await ap.locator("tr", { hasText: testName }).filter({ hasText: "₹500" }).waitFor();
      check("admin edits commission to 25% → final ₹500", true, "₹400 + 25% = ₹500");
      await shot(ap, "02-admin-catalogue");
      labTestId = (await prisma.labTest.findFirstOrThrow({ where: { name: testName } })).id;
    });

    // ── 2. Doctor: complete the visit with lab tests ──
    const docCtx = await contextFor(browser, doctor);
    const dp = await docCtx.newPage();
    await step("doctor completes visit", dp, async () => {
      await dp.goto(`${BASE}/doctor/dashboard`);
      await dp.getByRole("button", { name: "Start Prescription" }).first().click({ timeout: 90_000 });
      const testInput = dp.getByPlaceholder("Test name (e.g. CBC, X-Ray Chest)");
      await testInput.first().fill("CBC");
      await dp.getByText("Patient can book this in the app: Complete Hemogram (CBC) · ₹278").waitFor();
      check("doctor types 'CBC' → editor says bookable as Complete Hemogram (CBC) · ₹278", true, "hint shown");
      await dp.getByRole("button", { name: "Add test" }).click();
      await testInput.nth(1).fill(testName);
      await dp.getByText(`Patient can book this in the app: ${testName} · ₹500`).waitFor();
      await dp.getByRole("button", { name: "Add test" }).click();
      await testInput.nth(2).fill("Chest X-ray PA view");
      await dp.getByText("Not in the lab test list — the patient can't book it in the app").waitFor();
      check("non-lab test (X-ray) marked not bookable", true, "hint shown");
      await dp.getByLabel(/I confirm that the medicines and tests/).check();
      await shot(dp, "03-doctor-prescription");
      await dp.getByRole("button", { name: "Mark Complete" }).first().click();
      await dp.getByText("Complete this consultation?").waitFor();
      await dp.getByRole("button", { name: "Mark Complete" }).last().click();
      for (let i = 0; i < 30 && (await prisma.appointment.findUniqueOrThrow({ where: { id: visit.id } })).status !== "COMPLETED"; i++) await dp.waitForTimeout(500);
      const done = await prisma.appointment.findUniqueOrThrow({ where: { id: visit.id }, include: { tests: true } });
      check("visit completed with 3 tests, 2 linked to the catalogue", done.status === "COMPLETED" && done.tests.length === 3 && done.tests.filter((t) => t.labTestId).length === 2, `${done.status} ${done.tests.map((t) => `${t.name}:${t.labTestId ? "linked" : "-"}`).join(", ")}`);
    });

    // ── 3. Patient: book + pin + slot + pay online ──
    const patCtx = await contextFor(browser, patient, { mobile: true });
    const pp = await patCtx.newPage();
    await step("patient books", pp, async () => {
      await pp.goto(`${BASE}/patient/appointments`);
      let book = pp.getByRole("link", { name: "Book lab tests" });
      if (!(await book.first().isVisible({ timeout: 20_000 }).catch(() => false))) {
        // Completed visits may sit under a "Past" tab.
        await pp.getByRole("button", { name: /past|history|completed/i }).first().click().catch(() => {});
        book = pp.getByRole("link", { name: "Book lab tests" });
      }
      await book.first().waitFor({ timeout: 30_000 });
      const card = pp.locator("div", { hasText: "Lab tests recommended" }).last();
      check("appointment card lists the recommended tests", (await card.innerText()).includes("CBC") && (await card.innerText()).includes("Chest X-ray"), (await card.innerText()).replace(/\s+/g, " ").slice(0, 160));
      await shot(pp, "04-patient-appointment-card");
      await book.first().click();
      await pp.getByText("Prescribed tests").waitFor({ timeout: 60_000 });
      const body = await pp.locator("body").innerText();
      check("booking page: both bookable tests with patient prices, total ₹778", body.includes("Complete Hemogram (CBC)") && body.includes(testName) && body.includes("₹778"), "₹278 + ₹500");
      check("X-ray listed as not bookable", body.includes("Not bookable in the app: Chest X-ray PA view"), "shown");
      check("address + PIN prefilled from profile", (await pp.locator("textarea").first().inputValue()).includes("Karve Road") && (await pp.getByPlaceholder("411001").inputValue()) === "411038", "prefilled");
      check("map pin is required (no auto pin)", body.includes("Pin your location on the map to continue."), "required");
      const submit = pp.getByRole("button", { name: /Pay ₹778/ });
      check("can't book before pinning + picking a slot", await submit.isDisabled(), "disabled");
      await pp.getByRole("button", { name: "Use my current location" }).click();
      await pp.getByText(`Location pinned (${HOME.latitude.toFixed(5)}, ${HOME.longitude.toFixed(5)})`).waitFor();
      check("GPS button drops the pin at the phone's location", true, `${HOME.latitude}, ${HOME.longitude}`);
      // Fine-tune: tap the map a little off-centre, as a patient nudging it to the door.
      const map = pp.locator(".leaflet-container");
      const box = (await map.boundingBox())!;
      await map.tap({ position: { x: box.width / 2 + 40, y: box.height / 2 - 50 } });
      await pp.waitForTimeout(400);
      const pinned = (await pp.getByText(/Location pinned \(/).innerText()).match(/\(([\d.]+), ([\d.]+)\)/);
      check("tapping the map moves the pin", !!pinned && (pinned[1] !== HOME.latitude.toFixed(5) || pinned[2] !== HOME.longitude.toFixed(5)), pinned?.[0] ?? "none");
      const selects = pp.locator("select");
      const day = await selects.nth(0).locator("option").nth(1).getAttribute("value"); // tomorrow
      await selects.nth(0).selectOption(day!);
      await selects.nth(1).selectOption("07-09");
      await pp.getByRole("button", { name: /Pay online/ }).click();
      await shot(pp, "05-patient-booking-form");
      await submit.click();
      await pp.getByText("Payment received — your lab tests are booked.").waitFor({ timeout: 60_000 });
      check("online checkout → back on My lab tests, payment confirmed", pp.url().includes("/patient/lab-tests"), pp.url());
      await shot(pp, "06-patient-paid");
    });
    const booking = await prisma.labBooking.findFirst({ where: { patientId: patient.id }, include: { items: true } });
    check("booking saved: paid online, REQUESTED, ₹778, PIN, slot 7–9, map pin",
      !!booking && booking.status === "REQUESTED" && booking.paymentStatus === "PAID" && booking.paymentMethod === "ONLINE" && booking.totalAmount === 778 &&
        booking.pinCode === "411038" && booking.collectionSlot === "07-09" && booking.lat != null && booking.patientAge === 45 && booking.patientGender === "Female",
      JSON.stringify(booking && { s: booking.status, p: booking.paymentStatus, t: booking.totalAmount, pin: booking.pinCode, slot: booking.collectionSlot, lat: booking.lat, lng: booking.lng }));

    // ── 4. Admin: request → WhatsApp hand-off → confirm → report ──
    await step("admin handles the request", ap, async () => {
      await ap.goto(`${BASE}/admin/lab-bookings`);
      const card = ap.locator("div.rounded-2xl", { hasText: "Sunita Joshi" }).first();
      await card.waitFor({ timeout: 60_000 });
      const cardText = await card.innerText();
      check("admin sees the paid request with age/gender, slot and map link", /45 y, Female/.test(cardText) && cardText.includes("7 AM – 9 AM") && cardText.includes("Open pin in Google Maps"), cardText.replace(/\s+/g, " ").slice(0, 200));
      const href = await card.getByRole("link", { name: /Share on WhatsApp/ }).getAttribute("href");
      const text = decodeURIComponent((href ?? "").replace("https://wa.me/?text=", ""));
      const lines = text.split("\n");
      const has = (s: string) => lines.some((l) => l.startsWith(s));
      check("WhatsApp text has every field the lab needs",
        lines[0] === "Full Name: Sunita Joshi" && lines[1] === "Age: 45" && lines[2] === "Gender: Female" && lines[3].startsWith("Phone number: +91 ") &&
          text.includes("1. Complete Hemogram (CBC)") && text.includes(`2. ${testName}`) && !text.includes("Chest X-ray") &&
          has("Address with Pincode: Flat 7, Shanti Apartments, Karve Road, Kothrud, Pune - 411038") &&
          has(`Coordinates: ${booking!.lat!.toFixed(6)}, ${booking!.lng!.toFixed(6)}`) && has("Map: https://www.google.com/maps/search/?api=1&query=") &&
          has("Time slot: ") && text.includes("7 AM – 9 AM"),
        `\n${text}`);
      await shot(ap, "07-admin-request");
      const patched = ap.waitForResponse((r) => r.url().includes(`/api/admin/lab-bookings/${booking!.id}`) && r.request().method() === "PATCH");
      await card.locator("select").selectOption("CONFIRMED");
      check("status change saved", (await patched).ok(), "PATCH ok");
      await ap.getByRole("button", { name: /^Confirmed/ }).click();
      await ap.locator("div.rounded-2xl", { hasText: "Sunita Joshi" }).filter({ hasText: "Confirmed" }).first().waitFor();
      const confirmed = ap.locator("div.rounded-2xl", { hasText: "Sunita Joshi" }).first();
      await confirmed.getByPlaceholder("e.g. Sample collection tomorrow 8–9 AM").fill("Our technician Ramesh will come at 7:30 AM. Please stay fasting.");
      const noted = ap.waitForResponse((r) => r.url().includes(`/api/admin/lab-bookings/${booking!.id}`) && r.request().method() === "PATCH");
      await confirmed.getByRole("button", { name: "Save", exact: true }).click();
      check("note saved", (await noted).ok(), "PATCH ok");
      const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n% CBC report for Sunita Joshi\ntrailer<<>>\n%%EOF\n");
      const uploaded = ap.waitForResponse((r) => r.url().includes(`/api/admin/lab-bookings/${booking!.id}/reports`) && r.request().method() === "POST");
      await confirmed.locator("input[type=file]").setInputFiles({ name: "Sunita-Joshi-CBC-report.pdf", mimeType: "application/pdf", buffer: pdf });
      check("report upload accepted", (await uploaded).ok(), "POST ok");
      // Uploading completes the booking, so it moves to the Completed list.
      await ap.getByRole("button", { name: /^Completed/ }).click();
      await ap.locator("div.rounded-2xl", { hasText: "Sunita Joshi" }).filter({ hasText: "Sunita-Joshi-CBC-report.pdf" }).first().waitFor();
      await shot(ap, "08-admin-report-uploaded");
      const after = await prisma.labBooking.findUniqueOrThrow({ where: { id: booking!.id }, include: { reports: true } });
      check("report uploaded → booking COMPLETED, note saved", after.status === "COMPLETED" && after.reports.length === 1 && after.adminNote?.includes("Ramesh") === true, `${after.status} reports=${after.reports.length}`);
    });

    // ── 5. Patient: sees it all ──
    await step("patient gets the report", pp, async () => {
      await pp.goto(`${BASE}/patient/lab-tests`);
      await pp.getByText("Your report is ready").waitFor({ timeout: 60_000 });
      const body = await pp.locator("body").innerText();
      check("patient sees Completed, the admin's note and the report", body.includes("Completed") && body.includes("Our technician Ramesh") && body.includes("Sunita-Joshi-CBC-report.pdf"), "shown");
      await shot(pp, "09-patient-report");
      const [dl] = await Promise.all([pp.waitForEvent("download", { timeout: 30_000 }), pp.getByRole("button", { name: "Download" }).click()]);
      const file = await dl.path();
      check("Download gives the real PDF", !!file && fs.readFileSync(file!).toString().startsWith("%PDF") && dl.suggestedFilename() === "Sunita-Joshi-CBC-report.pdf", dl.suggestedFilename());
      await pp.goto(`${BASE}/patient/profile/documents`);
      await pp.getByText(/Lab report — /).first().waitFor({ timeout: 60_000 });
      check("report is in the records vault", true, "Profile → Documents");
      await shot(pp, "10-patient-vault");
    });
    const inbox = await prisma.notification.findMany({ where: { userId: patient.id }, orderBy: { createdAt: "asc" } });
    const titles = inbox.map((x) => x.title);
    check("patient inbox: paid, confirmed, report ready", titles.includes("Lab tests booked") && titles.includes("Lab booking confirmed") && titles.includes("Your lab report is ready"), titles.join(" | "));
  } finally {
    await browser.close();
    server?.kill("SIGTERM");
    mockServer.close();
    const reports = await prisma.labReport.findMany({ where: { booking: { patientId: { in: ids } } } });
    await Promise.all(reports.map((r) => deleteFromS3(r.fileUrl, "lab-reports")));
    await prisma.labBooking.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.patientDocument.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    if (labTestId) await prisma.labTest.delete({ where: { id: labTestId } }).catch(() => null);
    else await prisma.labTest.deleteMany({ where: { name: testName } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED — screenshots in ${SHOTS}` : `\nAll lab e2e checks passed — screenshots in ${SHOTS}`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
