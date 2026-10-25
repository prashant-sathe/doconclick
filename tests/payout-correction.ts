// Correcting a PAID settlement's UTR/date (P3-32): admin-only PATCH on
// /api/admin/finance/settlements/[id]/paid, validated like Mark paid plus a
// reason; conditional on PAID with the values just read, and every edit
// leaves an append-only SettlementPayoutCorrection row (old → new, reason,
// admin). PREPARED / NO_PAYOUT / pre-tracking settlements are refused; the
// provider sees the corrected UTR, never the audit trail, and gets an inbox
// note with the new UTR only (P3-36); the table is append-only in the DB too.
// Throwaway users only (deleted afterwards); runs against a live dev server
// and the DB in .env. Never sends a real push.
//
//   npm run test:payout-correction     (BASE_URL defaults to http://localhost:3100)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { addDaysYmd, istDayKey } from "../src/lib/istDate";

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
  const today = istDayKey(new Date());
  const yesterday = addDaysYmd(today, -1);
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `6${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const bank = "HDFC | 1234567890 | IFSC: HDFC0001234";
  const admin = await mk({ name: "Fix Admin", role: "ADMIN" });
  const admin2 = await mk({ name: "Fix Admin Two", role: "ADMIN" });
  const doctor = await mk({ name: "Fix Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), bankDetails: bank } } });
  const owes = await mk({ name: "Fix Owing Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), bankDetails: bank } } });
  const patient = await mk({ name: "Fix Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });

  const visit = (providerId: string, over: Record<string, unknown> = {}) => prisma.appointment.create({ data: {
    doctorId: providerId, patientId: patient.id, symptoms: "x", consultType: "VIDEO", status: "COMPLETED", paymentStatus: "PAID",
    paymentMethod: "ONLINE", amount: 500, platformFee: 50, scheduledAt: new Date(Date.now() - 2 * DAY), paidAt: new Date(Date.now() - 2 * DAY), ...over,
  } as never });
  const settle = (who: U, extra: Record<string, unknown> = {}) => call(admin, "POST", "/api/admin/finance/settlements", { doctorId: who.id, ...extra });
  const fix = (id: string, body: Record<string, unknown>, as: U | null = admin) => call(as, "PATCH", `/api/admin/finance/settlements/${id}/paid`, body);
  const audit = (id: string) => prisma.settlementPayoutCorrection.findMany({ where: { settlementId: id }, orderBy: { createdAt: "asc" } });
  const REF1 = `41${stamp}01`;
  const REF2 = `41${stamp}02`;
  const REF3 = `41${stamp}03`;

  try {
    // 1. PREPARED → correction refused (use Mark paid)
    await visit(doctor.id);
    const s1 = await settle(doctor);
    const s1Id = String(s1.json.id);
    const early = await fix(s1Id, { reference: REF2, paidOn: today, reason: "typo in UTR" });
    check("PREPARED settlement → 409, nothing recorded", s1.json.status === "PREPARED" && early.status === 409 && (await audit(s1Id)).length === 0, `${early.status} ${early.json.error}`);

    const NOTE = `fix-note-${stamp}`;
    const paid = await call(admin, "POST", `/api/admin/finance/settlements/${s1Id}/paid`, { reference: REF1, paidOn: yesterday, note: NOTE });
    const before = await prisma.settlement.findUniqueOrThrow({ where: { id: s1Id } });
    check("Mark paid → PAID with REF1", paid.status === 200 && before.status === "PAID" && before.payoutReference === REF1, `${paid.status} ${before.payoutReference}`);

    // 2. Auth
    const asDoctor = await fix(s1Id, { reference: REF2, paidOn: today, reason: "typo in UTR" }, doctor);
    const asPatient = await fix(s1Id, { reference: REF2, paidOn: today, reason: "typo in UTR" }, patient);
    const asNone = await fix(s1Id, { reference: REF2, paidOn: today, reason: "typo in UTR" }, null);
    check("non-admin correction → 403 (doctor, patient); no session → 401", asDoctor.status === 403 && asPatient.status === 403 && asNone.status === 401, `${asDoctor.status} ${asPatient.status} ${asNone.status}`);

    // 3. Validation (same as Mark paid, plus reason; no-op refused)
    const badRef = await fix(s1Id, { reference: "ab", paidOn: today, reason: "typo in UTR" });
    const future = await fix(s1Id, { reference: REF2, paidOn: addDaysYmd(today, 2), reason: "typo in UTR" });
    const old = await fix(s1Id, { reference: REF2, paidOn: addDaysYmd(today, -400), reason: "typo in UTR" });
    const noReason = await fix(s1Id, { reference: REF2, paidOn: today, reason: "  no " });
    const longReason = await fix(s1Id, { reference: REF2, paidOn: today, reason: "x".repeat(301) });
    const same = await fix(s1Id, { reference: REF1.toLowerCase(), paidOn: yesterday, reason: "no change at all" });
    check("bad UTR / future date / >1 year / short or long reason / unchanged → 400",
      [badRef, future, old, noReason, longReason, same].every((r) => r.status === 400),
      [badRef, future, old, noReason, longReason, same].map((r) => r.status).join(","));
    check("…settlement untouched, no audit rows", (await prisma.settlement.findUniqueOrThrow({ where: { id: s1Id } })).payoutReference === REF1 && (await audit(s1Id)).length === 0, "ok");

    // 4. Edit once → new values, audit row with the old ones
    const REASON = `Typed the wrong UTR ${stamp}`;
    const e1 = await fix(s1Id, { reference: ` ${REF2.slice(0, 6)} ${REF2.slice(6)} `, paidOn: today, reason: REASON });
    const row = await prisma.settlement.findUniqueOrThrow({ where: { id: s1Id } });
    const a1 = await audit(s1Id);
    check("correction → 200, UTR + date updated, still PAID",
      e1.status === 200 && e1.json.payoutReference === REF2 && row.status === "PAID" && row.payoutReference === REF2 && istDayKey(row.paidAt!) === today,
      `${e1.status} ${row.payoutReference} ${row.paidAt?.toISOString()}`);
    check("…note, amounts and original marked-paid audit unchanged",
      row.payoutNote === NOTE && row.netAmount === before.netAmount && row.paidByAdminId === admin.id && row.markedPaidAt?.getTime() === before.markedPaidAt?.getTime(),
      `${row.payoutNote} ₹${row.netAmount}`);
    check("…one audit row: previous REF1/yesterday → REF2/today, reason, admin",
      a1.length === 1 && a1[0].previousReference === REF1 && istDayKey(a1[0].previousPaidAt!) === yesterday && a1[0].newReference === REF2 && istDayKey(a1[0].newPaidAt) === today && a1[0].reason === REASON && a1[0].correctedByAdminId === admin.id,
      JSON.stringify(a1.map((a) => [a.previousReference, a.newReference, a.reason])));

    // 5. Parallel corrections by two admins → never a lost or broken audit
    // entry: each 200 adds exactly one row, every row's "previous" is the
    // row before's "new", and the settlement holds the last one. (Requests
    // that read after another committed may legitimately win too, or get
    // 400 "nothing changed"; ones that raced the same read get 409.)
    const race = await Promise.all([
      ...Array.from({ length: 3 }, () => fix(s1Id, { reference: REF3, paidOn: today, reason: "second fix, admin one" })),
      ...Array.from({ length: 3 }, () => fix(s1Id, { reference: `${REF3}9`, paidOn: today, reason: "second fix, admin two" }, admin2)),
    ]);
    const a2 = await audit(s1Id);
    const now = await prisma.settlement.findUniqueOrThrow({ where: { id: s1Id } });
    const wins = race.filter((r) => r.status === 200).length;
    const chained = a2.every((r, i) => i === 0 || (r.previousReference === a2[i - 1].newReference && r.previousPaidAt?.getTime() === a2[i - 1].newPaidAt.getTime()));
    check("6 parallel corrections → only 200/400/409; one audit row per 200, chain unbroken, settlement = last row",
      wins >= 1 && race.every((r) => [200, 400, 409].includes(r.status)) && a2.length === 1 + wins && chained && a2[a2.length - 1].newReference === now.payoutReference,
      `${race.map((r) => r.status).join(",")} rows=${a2.length} chained=${chained} now=${now.payoutReference}`);

    // 6. Admin history shows the trail; provider sees only the corrected UTR
    const hist = await call(admin, "GET", `/api/admin/finance/settlements/history?doctorId=${doctor.id}`);
    const h0 = (hist.json as unknown as J[])[0] ?? {};
    const trail = (h0.payoutCorrections as J[] | undefined) ?? [];
    const oldest = trail[trail.length - 1] ?? {};
    check("admin history lists the corrections newest first with admin names",
      trail.length === a2.length && trail[0].newReference === now.payoutReference && oldest.previousReference === REF1 && oldest.reason === REASON && oldest.correctedByAdminName === admin.name,
      `${trail.length} ${oldest.previousReference} ${oldest.correctedByAdminName}`);
    const mine = await call(doctor, "GET", "/api/doctor/settlements");
    const first = (mine.json as unknown as J[])[0] ?? {};
    check("provider sees the corrected UTR, never the audit trail or reason",
      first.payoutReference === now.payoutReference && !("payoutCorrections" in first) && !mine.text.includes(REASON) && !mine.text.includes(REF1),
      `${first.payoutReference} keys=${Object.keys(first).join(",")}`);

    // 7. Duplicate UTR from another settlement → confirm first
    await visit(doctor.id, { consultType: "CLINIC" });
    const s2 = await settle(doctor);
    const s2Id = String(s2.json.id);
    await call(admin, "POST", `/api/admin/finance/settlements/${s2Id}/paid`, { reference: `51${stamp}01`, paidOn: today });
    const dup = await fix(s2Id, { reference: String(now.payoutReference), paidOn: today, reason: "used the wrong transfer" });
    check("correcting to a UTR on another settlement → 409 DUPLICATE_REFERENCE, unchanged",
      dup.status === 409 && dup.json.code === "DUPLICATE_REFERENCE" && (await prisma.settlement.findUniqueOrThrow({ where: { id: s2Id } })).payoutReference === `51${stamp}01` && (await audit(s2Id)).length === 0,
      `${dup.status} ${dup.json.code}`);
    const dupOk = await fix(s2Id, { reference: String(now.payoutReference), paidOn: today, reason: "used the wrong transfer", confirmDuplicate: true });
    check("…confirmed → 200 with an audit row", dupOk.status === 200 && (await audit(s2Id)).length === 1, `${dupOk.status}`);

    // 8. NO_PAYOUT and pre-tracking (status null) settlements → 409
    await visit(owes.id, { paymentMethod: "CASH", amount: 1000, platformFee: 100 });
    const s3 = await settle(owes, { acknowledgeNegative: true });
    const neg = await fix(String(s3.json.id), { reference: REF3, paidOn: today, reason: "should not work" });
    const legacy = await prisma.settlement.create({ data: { doctorId: owes.id, netAmount: 100, onlinePayoutOwed: 100 } });
    const leg = await fix(legacy.id, { reference: REF3, paidOn: today, reason: "should not work" });
    const missing = await fix("does-not-exist", { reference: REF3, paidOn: today, reason: "should not work" });
    check("NO_PAYOUT → 409; pre-tracking (null) → 409; unknown id → 404; no audit rows",
      s3.json.status === "NO_PAYOUT" && neg.status === 409 && leg.status === 409 && missing.status === 404 && (await audit(String(s3.json.id))).length === 0 && (await audit(legacy.id)).length === 0,
      `${s3.json.status} ${neg.status} ${leg.status} ${missing.status}`);

    // 9. The provider is told (inbox) the NEW UTR only — in their own
    // language, never the reason or the admin's name (P3-36).
    const inboxFor = async (userId: string, needle: string) => {
      for (let i = 0; i < 25; i++) {
        const rows = await prisma.notification.findMany({ where: { userId, kind: "payoutReferenceCorrected" }, orderBy: { createdAt: "desc" } });
        const hit = rows.find((r) => r.body.includes(needle));
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    };
    const nurse = await mk({ name: "Fix Nurse", role: "NURSE" });
    const langs: Array<[string, U, string, RegExp]> = [["en-IN", doctor, "/doctor/earnings", /corrected/], ["hi-IN", owes, "/doctor/earnings", /सही किया/], ["mr-IN", nurse, "/nurse/earnings", /दुरुस्त केला/]];
    let k = 0;
    for (const [lang, who, url, wording] of langs) {
      await prisma.user.update({ where: { id: who.id }, data: { language: lang } });
      await visit(who.id, { consultType: "CLINIC", paymentMethod: "ONLINE" });
      const sx = await settle(who);
      const sxId = String(sx.json.id);
      await call(admin, "POST", `/api/admin/finance/settlements/${sxId}/paid`, { reference: `61${stamp}${k}1`, paidOn: today });
      const newRef = `61${stamp}${k}2`;
      const secret = `private reason ${lang} ${stamp}`;
      const r = await fix(sxId, { reference: newRef, paidOn: today, reason: secret });
      const n = await inboxFor(who.id, newRef);
      check(`${lang}: correction → inbox row with the new UTR only, localized, right link`,
        r.status === 200 && !!n && wording.test(n.body) && n.url === url && !n.body.includes(secret) && !n.title.includes(secret) && !n.body.includes(admin.name) && !n.body.includes(`61${stamp}${k}1`),
        `${r.status} ${n?.title} | ${n?.body} | ${n?.url}`);
      k++;
    }
    const failedFix = await fix(s1Id, { reference: "xx", paidOn: today, reason: "bad input" });
    const countBefore = await prisma.notification.count({ where: { userId: doctor.id, kind: "payoutReferenceCorrected" } });
    const noop = await fix(s1Id, { reference: String((await prisma.settlement.findUniqueOrThrow({ where: { id: s1Id } })).payoutReference), paidOn: istDayKey((await prisma.settlement.findUniqueOrThrow({ where: { id: s1Id } })).paidAt!), reason: "nothing changes" });
    await new Promise((r) => setTimeout(r, 800));
    check("rejected / no-change corrections send no notification", failedFix.status === 400 && noop.status === 400 && (await prisma.notification.count({ where: { userId: doctor.id, kind: "payoutReferenceCorrected" } })) === countBefore, `${failedFix.status} ${noop.status}`);

    // 10. Database-level append-only protection
    const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
    const target = (await audit(s1Id))[0];
    const upd = await rejects(() => prisma.settlementPayoutCorrection.update({ where: { id: target.id }, data: { reason: "tampered" } }));
    const updRaw = await rejects(() => prisma.$executeRawUnsafe(`UPDATE "SettlementPayoutCorrection" SET "newReference" = 'X' WHERE id = '${target.id}'`));
    const del = await rejects(() => prisma.settlementPayoutCorrection.delete({ where: { id: target.id } }));
    const delMany = await rejects(() => prisma.settlementPayoutCorrection.deleteMany({ where: { settlementId: s1Id } }));
    const trunc = await rejects(() => prisma.$executeRawUnsafe(`TRUNCATE "SettlementPayoutCorrection"`));
    const delSettlement = await rejects(() => prisma.settlement.delete({ where: { id: s1Id } }));
    const intact = (await audit(s1Id)).find((a) => a.id === target.id);
    check("DB rejects UPDATE, DELETE, deleteMany, TRUNCATE on corrections, and deleting a settlement that has them",
      upd && updRaw && del && delMany && trunc && delSettlement && intact?.reason === target.reason && !!(await prisma.settlement.findUnique({ where: { id: s1Id } })),
      [upd, updRaw, del, delMany, trunc, delSettlement].join(","));
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: { in: ids } } });
    // Test-only purge: the append-only trigger lets DELETE through inside a
    // transaction that sets this flag (nothing in src/ ever does).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.allow_correction_purge = 'on'`);
      await tx.settlementPayoutCorrection.deleteMany({ where: { settlement: { doctorId: { in: ids } } } });
      await tx.settlement.deleteMany({ where: { doctorId: { in: ids } } });
    });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
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
