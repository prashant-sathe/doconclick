// Settlement payouts (F27): "Settle Now" only prepares a settlement; the
// admin marks it paid with the UTR + date (+ an admin-only note) as a
// conditional claim — a double click is a 409 and nothing is ever marked paid
// twice; a UTR already used elsewhere needs a second confirm; net ≤ 0 has no
// payout. An admin can dismiss a payout request with a reason, which the
// provider gets as a push/inbox row in their language. Providers see the
// status/UTR/date of their own settlements, never the admin note.
// Throwaway users only (deleted afterwards); runs against a live dev server
// and the DB in .env. Never sends a real push (test users have no tokens).
//
//   npm run test:payout-utr            (BASE_URL defaults to http://localhost:3100)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { addDaysYmd, istDayKey } from "../src/lib/istDate";
import { normalizePayoutReference, parsePaidOn } from "../src/lib/settlementPayout";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
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
  const text = await res.text();
  let json: J = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

async function main() {
  // ── Pure ──
  const today = istDayKey(new Date());
  check("UTR normalised (spaces, case) and validated",
    normalizePayoutReference(" abcd 1234 5678 ") === "ABCD12345678" && normalizePayoutReference("ab12") === null && normalizePayoutReference("UTR#123456") === null && normalizePayoutReference("-123456") === null && normalizePayoutReference(42) === null,
    "ok");
  check("payout date: today OK; tomorrow, >1 year back, bad dates refused",
    !!parsePaidOn(today) && parsePaidOn(addDaysYmd(today, 1)) === null && parsePaidOn(addDaysYmd(today, -400)) === null && parsePaidOn("2026-02-31") === null && parsePaidOn(undefined) === null,
    today);

  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `7${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const bank = "HDFC | 1234567890 | IFSC: HDFC0001234";
  const admin = await mk({ name: "UTR Admin", role: "ADMIN" });
  const doctor = await mk({ name: "UTR Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), bankDetails: bank } } });
  const owes = await mk({ name: "UTR Owing Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), bankDetails: bank } } });
  const nurse = await mk({ name: "UTR Nurse", role: "NURSE", language: "mr-IN", nurseProfile: { create: { status: "APPROVED", registrationFeePaid: true, subscriptionPaidUntil: new Date(Date.now() + 30 * DAY), bankDetails: bank } } });
  const patient = await mk({ name: "UTR Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });

  const visit = (providerId: string, over: Record<string, unknown> = {}) => prisma.appointment.create({ data: {
    doctorId: providerId, patientId: patient.id, symptoms: "x", consultType: "VIDEO", status: "COMPLETED", paymentStatus: "PAID",
    paymentMethod: "ONLINE", amount: 500, platformFee: 50, scheduledAt: new Date(Date.now() - 2 * DAY), paidAt: new Date(Date.now() - 2 * DAY), ...over,
  } as never });
  const settle = (who: U, extra: Record<string, unknown> = {}) => call(admin, "POST", "/api/admin/finance/settlements", { doctorId: who.id, ...extra });
  const markPaid = (id: string, body: Record<string, unknown>, as: U | null = admin) => call(as, "POST", `/api/admin/finance/settlements/${id}/paid`, body);
  const dismiss = (id: string, reason: string, as: U | null = admin) => call(as, "POST", `/api/admin/finance/payout-requests/${id}/dismiss`, { reason });

  try {
    // 1. Request → settle → PREPARED (not paid yet)
    await visit(doctor.id);
    const req1 = await call(doctor, "POST", "/api/doctor/payout-requests");
    const s1 = await settle(doctor);
    const s1Id = String(s1.json.id);
    check("Settle Now → PREPARED settlement, ₹450, request fulfilled",
      s1.status === 200 && s1.json.status === "PREPARED" && s1.json.netAmount === 450 && (await prisma.payoutRequest.findUnique({ where: { id: String(req1.json.id) } }))?.status === "FULFILLED",
      `${s1.status} ${s1.json.status} ₹${s1.json.netAmount}`);
    let mine = await call(doctor, "GET", "/api/doctor/settlements");
    check("provider sees it as PREPARED, no reference yet", mine.status === 200 && (mine.json as unknown as J[])[0]?.status === "PREPARED" && (mine.json as unknown as J[])[0]?.payoutReference === null, mine.text.slice(0, 120));

    // 2. Auth + validation
    const asDoctor = await markPaid(s1Id, { reference: "412345678901", paidOn: today }, doctor);
    const asNone = await markPaid(s1Id, { reference: "412345678901", paidOn: today }, null);
    check("non-admin Mark paid → 403, no session → 401", asDoctor.status === 403 && asNone.status === 401, `${asDoctor.status} ${asNone.status}`);
    const badRef = await markPaid(s1Id, { reference: "ab", paidOn: today });
    const future = await markPaid(s1Id, { reference: "412345678901", paidOn: addDaysYmd(today, 2) });
    const longNote = await markPaid(s1Id, { reference: "412345678901", paidOn: today, note: "x".repeat(501) });
    check("bad UTR / future date / long note → 400", badRef.status === 400 && future.status === 400 && longNote.status === 400, `${badRef.status} ${future.status} ${longNote.status}`);
    check("…and the settlement is still PREPARED", (await prisma.settlement.findUniqueOrThrow({ where: { id: s1Id } })).status === "PREPARED", "ok");

    // 3. Double / parallel Mark paid → exactly one 200, the rest 409
    const NOTE = `admin-only-note-${stamp}`;
    const race = await Promise.all(Array.from({ length: 6 }, () => markPaid(s1Id, { reference: "4123 4567 8901", paidOn: today, note: NOTE })));
    const row = await prisma.settlement.findUniqueOrThrow({ where: { id: s1Id } });
    check("6 parallel Mark paid → one 200, five 409",
      race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 5,
      race.map((r) => r.status).join(","));
    check("…row PAID with UTR, date, note, admin id, timestamp",
      row.status === "PAID" && row.payoutReference === "412345678901" && istDayKey(row.paidAt!) === today && row.payoutNote === NOTE && row.paidByAdminId === admin.id && !!row.markedPaidAt,
      `${row.status} ${row.payoutReference} ${row.paidAt?.toISOString()} by ${row.paidByAdminId === admin.id}`);
    const again = await markPaid(s1Id, { reference: "999999999999", paidOn: today, confirmDuplicate: true });
    check("a paid settlement can't be re-marked (409, UTR unchanged)",
      again.status === 409 && (await prisma.settlement.findUniqueOrThrow({ where: { id: s1Id } })).payoutReference === "412345678901",
      `${again.status} ${again.json.error}`);

    // 4. Provider view: status/UTR/date, never the admin note or admin ids
    mine = await call(doctor, "GET", "/api/doctor/settlements");
    const first = (mine.json as unknown as J[])[0] ?? {};
    check("provider sees PAID + UTR + date", first.status === "PAID" && first.payoutReference === "412345678901" && typeof first.paidAt === "string", `${first.status} ${first.payoutReference} ${first.paidAt}`);
    check("provider never gets the admin note / admin ids / idempotency key",
      !mine.text.includes(NOTE) && !("payoutNote" in first) && !("paidByAdminId" in first) && !("settledByAdminId" in first) && !("idempotencyKey" in first),
      Object.keys(first).join(","));
    const hist = await call(admin, "GET", `/api/admin/finance/settlements/history?doctorId=${doctor.id}`);
    const h0 = (hist.json as unknown as J[])[0] ?? {};
    check("admin history shows the note and who marked it paid", h0.payoutNote === NOTE && (h0.paidByAdmin as J | null)?.name === admin.name, `${h0.payoutNote} ${(h0.paidByAdmin as J | null)?.name}`);

    // 5. Same UTR on another settlement → warn first, record on confirm
    await visit(nurse.id, { consultType: "HOME" });
    const s2 = await settle(nurse);
    const s2Id = String(s2.json.id);
    const dup = await markPaid(s2Id, { reference: "412345678901", paidOn: today });
    check("duplicate UTR → 409 DUPLICATE_REFERENCE, still PREPARED",
      dup.status === 409 && dup.json.code === "DUPLICATE_REFERENCE" && dup.json.requiresConfirmation === true && (await prisma.settlement.findUniqueOrThrow({ where: { id: s2Id } })).status === "PREPARED",
      `${dup.status} ${dup.json.code}`);
    const dupOk = await markPaid(s2Id, { reference: "412345678901", paidOn: today, confirmDuplicate: true });
    check("…confirmed → 200 PAID", dupOk.status === 200 && dupOk.json.status === "PAID", `${dupOk.status} ${dupOk.json.status}`);

    // 6. Net ≤ 0 → NO_PAYOUT, nothing to mark paid
    await visit(owes.id, { paymentMethod: "CASH", amount: 1000, platformFee: 100 });
    const s3 = await settle(owes, { acknowledgeNegative: true });
    const neg = await markPaid(String(s3.json.id), { reference: "512345678901", paidOn: today });
    check("negative net → NO_PAYOUT; Mark paid → 409", s3.json.status === "NO_PAYOUT" && neg.status === 409, `${s3.json.status} ${neg.status}`);

    // 7. Dismiss a payout request with a reason (nurse, Marathi)
    await visit(nurse.id, { consultType: "HOME" });
    const req2 = await call(nurse, "POST", "/api/doctor/payout-requests");
    const req2Id = String(req2.json.id);
    let queue = await call(admin, "GET", "/api/admin/finance/settlements");
    let qRow = (queue.json as unknown as J[]).find((r) => r.doctorId === nurse.id);
    check("settle queue carries the open request id", req2.status === 200 && qRow?.payoutRequestId === req2Id, `${req2.status} ${qRow?.payoutRequestId}`);
    const dNon = await dismiss(req2Id, "Bank details look wrong", nurse);
    const dShort = await dismiss(req2Id, "no");
    check("non-admin dismiss → 403; reason too short → 400", dNon.status === 403 && dShort.status === 400, `${dNon.status} ${dShort.status}`);
    const REASON = `Bank IFSC does not match ${stamp}`;
    const dRace = await Promise.all(Array.from({ length: 4 }, () => dismiss(req2Id, REASON)));
    const req2Row = await prisma.payoutRequest.findUniqueOrThrow({ where: { id: req2Id } });
    check("4 parallel dismisses → one 200, three 409; DISMISSED with reason + admin id",
      dRace.filter((r) => r.status === 200).length === 1 && dRace.filter((r) => r.status === 409).length === 3 && req2Row.status === "DISMISSED" && req2Row.dismissReason === REASON && req2Row.dismissedByAdminId === admin.id && !!req2Row.resolvedAt,
      `${dRace.map((r) => r.status).join(",")} ${req2Row.status}`);
    queue = await call(admin, "GET", "/api/admin/finance/settlements");
    qRow = (queue.json as unknown as J[]).find((r) => r.doctorId === nurse.id);
    check("…no longer pending in the settle queue (visits still owed)", !!qRow && qRow.payoutRequestId === null && qRow.payoutRequestedAt === null && qRow.netAmount === 450, `${qRow?.payoutRequestId} ₹${qRow?.netAmount}`);
    let inbox = null;
    for (let i = 0; i < 20 && !inbox; i++) {
      inbox = await prisma.notification.findFirst({ where: { userId: nurse.id, kind: "payoutRequestDismissed" } });
      if (!inbox) await new Promise((r) => setTimeout(r, 250));
    }
    check("provider notified in their language (Marathi inbox row with the reason)",
      !!inbox && inbox.title === "पेआउट विनंती नाकारली" && inbox.body.includes(REASON) && inbox.body.includes("450") && inbox.url === "/nurse/earnings",
      `${inbox?.title} | ${inbox?.body}`);
    const nurseReqs = await call(nurse, "GET", "/api/doctor/payout-requests");
    const nr0 = ((nurseReqs.json.requests as J[]) ?? [])[0] ?? {};
    check("provider sees DISMISSED + reason, not the admin id", nr0.status === "DISMISSED" && nr0.dismissReason === REASON && !("dismissedByAdminId" in nr0), Object.keys(nr0).join(","));
    const reAsk = await call(nurse, "POST", "/api/doctor/payout-requests");
    check("provider can request again after a dismissal", reAsk.status === 200, `${reAsk.status} ${reAsk.json.error ?? ""}`);
    const dFulfilled = await dismiss(String(req1.json.id), REASON);
    check("dismissing a fulfilled request → 409", dFulfilled.status === 409, `${dFulfilled.status} ${dFulfilled.json.error}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.settlement.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
