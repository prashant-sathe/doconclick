// Admin wallet adjustments (BUG-TRACKER #47): patients only, whole paise,
// capped, a recorded reason required, and the balance check is atomic — two
// debits racing for the same balance can't both succeed. Against a live dev
// server and the DB in .env, throwaway users only.
//
//   npm run test:wallet-adjust
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { MAX_ADMIN_ADJUSTMENT, ADJUSTMENT_REASON_MAX } from "../src/lib/walletLimits";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function adjust(as: U, userId: string, body: unknown) {
  const res = await fetch(`${BASE}/api/admin/wallets/${userId}/adjust`, {
    method: "POST", headers: { Cookie: cookieFor(as), "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string } };
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `2${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const admin = await mk({ name: "Wallet Admin", role: "ADMIN" });
  const patient = await mk({ name: "Wallet Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const doctor = await mk({ name: "Wallet Doctor", role: "DOCTOR" });
  const nurse = await mk({ name: "Wallet Nurse", role: "NURSE" });
  const gone = await mk({ name: "Wallet Deleted", role: "PATIENT", deletedAt: new Date() });
  const setBalance = (userId: string, balance: number) =>
    prisma.wallet.upsert({ where: { userId }, create: { userId, balance }, update: { balance } });
  const balanceOf = async (userId: string) => (await prisma.wallet.findUnique({ where: { userId } }))?.balance ?? null;
  const ok = { direction: "CREDIT", amount: 100, note: "Goodwill credit for a late visit" };

  try {
    // ── Who ──
    let r = await adjust(admin, doctor.id, ok);
    check("doctor → 400 patients only", r.status === 400 && (r.json.error ?? "").includes("patient"), `${r.status} ${r.json.error}`);
    r = await adjust(admin, nurse.id, ok);
    check("nurse → 400", r.status === 400, `${r.status}`);
    r = await adjust(admin, admin.id, ok);
    check("admin → 400", r.status === 400, `${r.status}`);
    check("…no wallet was created for a non-patient", (await balanceOf(doctor.id)) === null && (await balanceOf(nurse.id)) === null, "none");
    r = await adjust(admin, gone.id, ok);
    check("deleted patient → 404", r.status === 404, `${r.status}`);
    r = await adjust(admin, "no-such-user", ok);
    check("unknown user → 404", r.status === 404, `${r.status}`);
    r = await adjust(patient, patient.id, ok);
    check("a patient can't adjust (403)", r.status === 403, `${r.status}`);

    // ── Amount ──
    await setBalance(patient.id, 0);
    for (const [label, amount] of [["₹0.001", 0.001], ["₹0.004 (rounds to 0)", 0.004], ["zero", 0], ["negative", -5], ["a string", "50"], ["null", null]] as const) {
      r = await adjust(admin, patient.id, { ...ok, amount });
      check(`amount ${label} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    r = await adjust(admin, patient.id, { ...ok, amount: MAX_ADMIN_ADJUSTMENT + 1 });
    check("over the cap → 400", r.status === 400 && (r.json.error ?? "").includes("at most"), `${r.status} ${r.json.error}`);
    check("…nothing moved", (await balanceOf(patient.id)) === 0, `${await balanceOf(patient.id)}`);
    r = await adjust(admin, patient.id, { ...ok, amount: 12.345 });
    const t = await prisma.walletTransaction.findFirst({ where: { wallet: { userId: patient.id } }, orderBy: { createdAt: "desc" } });
    check("₹12.345 is rounded to ₹12.35 (balance and ledger)", r.status === 200 && Math.abs((await balanceOf(patient.id))! - 12.35) < 1e-9 && t?.amount === 12.35, `${r.status} balance ${await balanceOf(patient.id)} ledger ${t?.amount}`);
    r = await adjust(admin, patient.id, { ...ok, amount: MAX_ADMIN_ADJUSTMENT });
    check("exactly the cap → 200", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    // ── Reason ──
    await setBalance(patient.id, 500);
    for (const [label, note] of [["missing", undefined], ["blank", "     "], ["too short", "ok"], ["too long", "x".repeat(ADJUSTMENT_REASON_MAX + 1)]] as const) {
      r = await adjust(admin, patient.id, { direction: "CREDIT", amount: 10, ...(note === undefined ? {} : { note }) });
      check(`reason ${label} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    check("…balance untouched", (await balanceOf(patient.id)) === 500, `${await balanceOf(patient.id)}`);
    r = await adjust(admin, patient.id, { direction: "CREDIT", amount: 10, note: "   Manual correction, ticket 42   " });
    const stored = await prisma.walletTransaction.findFirst({ where: { wallet: { userId: patient.id } }, orderBy: { createdAt: "desc" } });
    check("reason stored trimmed, with the admin who made it", r.status === 200 && stored?.note === "Manual correction, ticket 42" && stored.adminId === admin.id, `${stored?.note} / ${stored?.adminId === admin.id}`);

    // ── Debit rules ──
    await setBalance(patient.id, 50);
    r = await adjust(admin, patient.id, { direction: "DEBIT", amount: 80, note: "Chargeback correction" });
    check("debit past the balance, no acknowledgement → 409 with both balances", r.status === 409 && r.json.requiresAcknowledgement === true && r.json.currentBalance === 50 && r.json.resultingBalance === -30, `${r.status} ${JSON.stringify(r.json)}`);
    check("…balance untouched, no ledger row", (await balanceOf(patient.id)) === 50 && (await prisma.walletTransaction.count({ where: { wallet: { userId: patient.id }, type: "ADMIN_DEBIT" } })) === 0, "ok");
    r = await adjust(admin, patient.id, { direction: "DEBIT", amount: 80, note: "Chargeback correction", acknowledgeNegative: true });
    check("acknowledged → 200, balance goes negative", r.status === 200 && (await balanceOf(patient.id)) === -30, `${r.status} ${await balanceOf(patient.id)}`);

    // ── Debits racing for one balance ──
    // Ten at once for ₹30 each against ₹100: only three fit. A check done before
    // the write would let several through; the conditional update lets exactly three.
    await setBalance(patient.id, 100);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => adjust(admin, patient.id, { direction: "DEBIT", amount: 30, note: `Concurrent debit ${i}` })),
    );
    const won = results.filter((x) => x.status === 200).length;
    const refused = results.filter((x) => x.status === 409).length;
    check("10 simultaneous ₹30 debits on ₹100 → exactly 3 succeed, 7 refused", won === 3 && refused === 7, `${won} × 200, ${refused} × 409`);
    check("…balance is ₹10, three ledger rows", (await balanceOf(patient.id)) === 10 && (await prisma.walletTransaction.count({ where: { wallet: { userId: patient.id }, type: "ADMIN_DEBIT", note: { startsWith: "Concurrent" } } })) === 3, `${await balanceOf(patient.id)}`);

    // ── Ledger balanceAfter matches ──
    await setBalance(patient.id, 40);
    await adjust(admin, patient.id, { direction: "DEBIT", amount: 15.5, note: "Small correction" });
    const last = await prisma.walletTransaction.findFirst({ where: { wallet: { userId: patient.id } }, orderBy: { createdAt: "desc" } });
    check("ledger balanceAfter is the real balance", last?.balanceAfter === 24.5 && (await balanceOf(patient.id)) === 24.5, `${last?.balanceAfter}`);
  } finally {
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
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
