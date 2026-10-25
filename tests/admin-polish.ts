// Admin polish (BUG-TRACKER #62): the doctor registration fee comes from
// Settings (₹0 = activated without paying; the webhook checks a payment
// against the amount its order was created for), patients without a name
// read "(name not set) · mobile", logging out while impersonating closes the
// ImpersonationLog, the splash image must be our own upload, and announcement
// links can't be protocol-relative. Pure checks, then against a live dev
// server and the DB in .env; the settings it touches are put back afterwards.
// (Announcements are only ever rejected here — a saved one goes to everyone.)
//
//   npm run test:admin-polish
import "dotenv/config";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import fs from "fs";
import { parse as parseEnv } from "dotenv";
import { prisma } from "../src/lib/prisma";
import { nameOrMobile } from "../src/lib/utils";
import { isSafeAnnouncementUrl, isInternalPath, validateButtons } from "../src/lib/announcements";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const CF_SECRET = process.env.CASHFREE_SECRET_KEY ?? "";
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string };
const tokenFor = (u: U) => jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET);
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J, setCookies: res.headers.getSetCookie() };
}
const as = (u: U) => `doconclick_token=${tokenFor(u)}`;

/** A Cashfree PAYMENT_SUCCESS webhook for a registration order, signed like Cashfree does. */
async function webhook(orderId: string, amount: number) {
  const body = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: { order: { order_id: orderId, order_amount: amount }, payment: { cf_payment_id: `pay_${orderId}`, payment_status: "SUCCESS" } },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", CF_SECRET).update(ts + body).digest("base64");
  return fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-signature": sig, "x-webhook-timestamp": ts }, body });
}

async function main() {
  // ── Pure ──
  check("nameOrMobile: a name is shown as-is", nameOrMobile("  Raj Patil ", "9876543210") === "Raj Patil", "ok");
  check("nameOrMobile: no name → '(name not set) · mobile'", nameOrMobile("", "9876543210") === "(name not set) · 9876543210" && nameOrMobile("   ", "9876543210") === "(name not set) · 9876543210" && nameOrMobile(null) === "(name not set)", nameOrMobile("", "9876543210"));
  for (const [url, ok] of [
    ["https://doconclick.co.in/offers", true], ["http://example.com", true], ["/patient/wallet", true], ["/doctor/profile?tab=bank", true],
    ["//evil.com", false], ["//evil.com/patient", false], ["/\\evil.com", false], ["javascript:alert(1)", false], ["data:text/html,hi", false],
    ["https:evil.com", true /* URL() normalises to https://evil.com/ — a full address */], ["/ /evil.com", false], ["https://", false], ["mailto:a@b.c", false],
  ] as const) {
    check(`announcement link ${JSON.stringify(url)} → ${ok ? "allowed" : "rejected"}`, isSafeAnnouncementUrl(url) === ok, String(isSafeAnnouncementUrl(url)));
  }
  check("only real paths are pushed in-app; '//evil.com' isn't", isInternalPath("/patient/wallet") && !isInternalPath("//evil.com") && !isInternalPath("https://x.com"), "ok");
  check("validateButtons rejects a protocol-relative link", validateButtons([{ label: "Go", url: "//evil.com" }]) === null && validateButtons([{ label: "Go", url: "/patient/wallet" }])?.length === 1, "ok");

  // ── Fixtures ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `5${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const admin = await mk({ name: "Polish Admin", role: "ADMIN" });
  const pending = (extra: Record<string, unknown> = {}) => ({ create: { status: "PENDING", registrationFeePaid: false, ...extra } });
  const freeDoc = await mk({ name: "Free Reg Doctor", role: "DOCTOR", doctorProfile: pending() });
  const midDoc = await mk({ name: "Mid Checkout Doctor", role: "DOCTOR", doctorProfile: pending() });
  const oldDoc = await mk({ name: "Old Order Doctor", role: "DOCTOR", doctorProfile: pending() });
  const noName = await mk({ name: "", role: "PATIENT", patientProfile: { create: { age: 0, gender: "" } } });
  const doctor = await mk({ name: "Booked Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY) } } });

  const settings = await prisma.platformSettings.findFirstOrThrow();
  const original = { doctorRegistrationFee: settings.doctorRegistrationFee, splashImageUrl: settings.splashImageUrl };
  const setFee = (fee: number) => call(as(admin), "PATCH", "/api/admin/settings", { doctorRegistrationFee: fee });

  try {
    // ── Registration fee from Settings ──
    for (const [label, value] of [["negative", -1], ["too big", 100001], ["text", "99"], ["blank", ""]] as const) {
      const r = await setFee(value as number);
      check(`settings: doctor fee ${label} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    // F44: null = "no discount" (the original price is charged), not ₹0.
    let r = await setFee(null as unknown as number);
    check("settings: discounted fee null → cleared (no discount), not ₹0", r.status === 200 && r.json.doctorRegistrationFee === null, `${r.status} ${r.json.doctorRegistrationFee}`);
    r = await setFee(250);
    check("settings: doctor fee ₹250 → saved", r.status === 200 && r.json.doctorRegistrationFee === 250, `${r.status} ${r.json.doctorRegistrationFee}`);
    const me = await call(as(midDoc), "GET", "/api/doctors/me");
    check("the doctor's own profile reports the ₹250 fee", me.json.registrationFee === 250, String(me.json.registrationFee));
    r = await call(as(midDoc), "POST", "/api/coupons/validate", { code: "NOPE-NOT-REAL", context: "DOCTOR_REGISTRATION" });
    check("(coupon preview still runs against the fee)", r.status === 400, `${r.status}`);

    // An order created at ₹150 (before the change) is paid at ₹150 — accepted.
    await prisma.doctorProfile.update({ where: { userId: midDoc.id }, data: { cashfreeOrderId: `docreg${midDoc.id}_1`, registrationOrderAmount: 150 } });
    await webhook(`docreg${midDoc.id}_1`, 150);
    let p = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: midDoc.id } });
    check("webhook: a payment for the amount the order was created at is accepted after a fee change", p.registrationFeePaid && !!p.trialEndsAt, `paid=${p.registrationFeePaid}`);
    await webhook(`docreg${midDoc.id}_1`, 150);
    const logs = await prisma.doctorPaymentLog.count({ where: { doctorId: midDoc.id, type: "REGISTRATION" } });
    check("…a retried webhook doesn't log it twice", logs === 1, `${logs} logs`);
    // An older order with no recorded amount falls back to the current fee.
    await prisma.doctorProfile.update({ where: { userId: oldDoc.id }, data: { cashfreeOrderId: `docreg${oldDoc.id}_1` } });
    await webhook(`docreg${oldDoc.id}_1`, 99);
    p = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: oldDoc.id } });
    check("webhook: an old order paid at ₹99 when the fee is now ₹250 → rejected", !p.registrationFeePaid, `paid=${p.registrationFeePaid}`);
    await webhook(`docreg${oldDoc.id}_1`, 250);
    p = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: oldDoc.id } });
    check("…and accepted at the current fee", p.registrationFeePaid, `paid=${p.registrationFeePaid}`);

    // Approve gate quotes the real fee.
    // Documents in place, so the only thing in the way is the fee.
    const unpaid = await mk({ name: "Unpaid Doctor", role: "DOCTOR", doctorProfile: pending({ medRegNo: `MMC-${stamp}`, medRegCertUrl: "https://x/cert.pdf", kycDocUrl: "https://x/kyc.pdf" }) });
    r = await call(as(admin), "PATCH", `/api/admin/doctors/${unpaid.id}`, { status: "APPROVED" });
    check("approve gate: 'hasn't paid the ₹250 registration fee'", r.status === 400 && (r.json.error ?? "").includes("₹250"), `${r.status} ${r.json.error}`);

    // ₹0 = free: activated without Cashfree.
    r = await setFee(0);
    check("settings: fee ₹0 → saved", r.status === 200 && r.json.doctorRegistrationFee === 0, `${r.status}`);
    r = await call(as(freeDoc), "POST", "/api/doctors/registration-fee/create-order", {});
    p = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: freeDoc.id } });
    const freeLog = await prisma.doctorPaymentLog.findFirst({ where: { doctorId: freeDoc.id } });
    check("fee ₹0: checkout activates directly (paid, trial started, ₹0 logged, no Cashfree order)", r.status === 200 && r.json.paid === true && p.registrationFeePaid && !!p.trialEndsAt && freeLog?.amount === 0 && !p.cashfreeOrderId, `${r.status} ${JSON.stringify(r.json)}`);
    r = await call(as(admin), "PATCH", `/api/admin/doctors/${unpaid.id}`, { status: "APPROVED" });
    check("fee ₹0: the approve gate no longer waits for a payment", r.status === 200, `${r.status} ${r.json.error ?? ""}`);
    const reg = await call(as(admin), "GET", "/api/admin/reports/doctor-registrations");
    const rows = (reg.json.rows as { doctorId: string; amount: number | null }[]) ?? [];
    check("registrations report shows what each doctor actually paid (₹150, ₹250, ₹0)", rows.find((x) => x.doctorId === midDoc.id)?.amount === 150 && rows.find((x) => x.doctorId === oldDoc.id)?.amount === 250 && rows.find((x) => x.doctorId === freeDoc.id)?.amount === 0, rows.filter((x) => [midDoc.id, oldDoc.id, freeDoc.id].includes(x.doctorId)).map((x) => x.amount).join(","));

    // ── Names ──
    await prisma.appointment.create({ data: { doctorId: doctor.id, patientId: noName.id, symptoms: "x", consultType: "VIDEO", status: "PENDING_APPROVAL", amount: 300, platformFee: 30, paymentMethod: "ONLINE", scheduledAt: new Date(Date.now() + DAY) } as never });
    const bookings = (await call(as(admin), "GET", "/api/admin/bookings")).json as unknown as { patient: { name: string; mobile: string } }[];
    const row = bookings.find((b) => b.patient.mobile === noName.mobile);
    check("admin bookings carry the patient's mobile, so a nameless patient can be shown", !!row && row.patient.name === "" && nameOrMobile(row.patient.name, row.patient.mobile) === `(name not set) · ${noName.mobile}`, JSON.stringify(row?.patient));

    // ── Impersonation log closed on logout ──
    const imp = await call(as(admin), "POST", `/api/admin/impersonate/${noName.id}`);
    const cookieHeader = imp.setCookies.map((c) => c.split(";")[0]).join("; ");
    check("(impersonation started)", imp.status === 200 && cookieHeader.includes("doconclick_impersonator_token="), `${imp.status}`);
    let log = await prisma.impersonationLog.findFirst({ where: { adminId: admin.id, targetUserId: noName.id } });
    check("…its log is open", !!log && log.endedAt === null, String(log?.endedAt));
    const out = await call(cookieHeader, "POST", "/api/auth/logout");
    log = await prisma.impersonationLog.findFirst({ where: { adminId: admin.id, targetUserId: noName.id } });
    check("logging out while impersonating closes the log (endedAt set)", out.status === 200 && !!log?.endedAt, `${out.status} ${log?.endedAt?.toISOString()}`);
    const imp2 = await call(as(admin), "POST", `/api/admin/impersonate/${noName.id}`);
    const exit = await call(imp2.setCookies.map((c) => c.split(";")[0]).join("; "), "POST", "/api/admin/impersonate/exit");
    const open = await prisma.impersonationLog.count({ where: { adminId: admin.id, endedAt: null } });
    check("'exit impersonation' still closes it too", exit.status === 200 && open === 0, `${exit.status} open=${open}`);

    // ── Splash image ──
    // The bucket the dev server uses is .env's — read it from there, not from
    // the shell (whose AWS_* belong to someone else and win over dotenv).
    const env = parseEnv(fs.readFileSync(".env"));
    const own = `https://${env.S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/app-splash/test-${stamp}.png`;
    for (const [label, url] of [["another site", "https://evil.example/splash.png"], ["our bucket, other folder", own.replace("app-splash", "doctor-docs")], ["a path trick", own.replace(`test-${stamp}`, "../doctor-docs/x")], ["javascript:", "javascript:alert(1)"], ["not a string", 42]] as const) {
      r = await call(as(admin), "PATCH", "/api/admin/settings", { splashImageUrl: url });
      check(`splash: ${label} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    r = await call(as(admin), "PATCH", "/api/admin/settings", { splashImageUrl: own });
    check("splash: our own app-splash upload → saved", r.status === 200 && r.json.splashImageUrl === own, `${r.status}`);
    await prisma.platformSettings.update({ where: { id: settings.id }, data: { splashImageUrl: "https://evil.example/old.png" } });
    const cfg = (await fetch(`${BASE}/api/app-config`).then((x) => x.json())) as { splash: { imageUrl: string | null } };
    check("app-config ignores an older stored URL that isn't ours", cfg.splash.imageUrl === null, String(cfg.splash.imageUrl));
    r = await call(as(admin), "PATCH", "/api/admin/settings", { splashImageUrl: null });
    check("splash: clearing it is allowed", r.status === 200 && r.json.splashImageUrl === null, `${r.status}`);

    // ── Announcements: rejected links / banners (nothing is saved) ──
    const before = await prisma.announcement.count();
    for (const [label, body] of [
      ["a protocol-relative button", { buttons: [{ label: "Offer", url: "//evil.com" }] }],
      ["a backslash button", { buttons: [{ label: "Offer", url: "/\\evil.com" }] }],
      ["a javascript: button", { buttons: [{ label: "Offer", url: "javascript:alert(1)" }] }],
      ["a banner from another site", { bannerImageUrl: "https://evil.example/banner.png" }],
    ] as const) {
      r = await call(as(admin), "POST", "/api/admin/announcements", { title: "Polish test", message: "x", audience: "BOTH", ...body });
      check(`announcement with ${label} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    check("…and none was created", (await prisma.announcement.count()) === before, "ok");
  } finally {
    await prisma.platformSettings.update({ where: { id: settings.id }, data: original });
    await prisma.impersonationLog.deleteMany({ where: { adminId: { in: ids } } });
    await prisma.doctorPaymentLog.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  const restored = await prisma.platformSettings.findFirstOrThrow();
  check("(settings put back as they were)", restored.doctorRegistrationFee === original.doctorRegistrationFee && restored.splashImageUrl === original.splashImageUrl, `fee ${restored.doctorRegistrationFee}`);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
