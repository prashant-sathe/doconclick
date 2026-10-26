// Invite & earn (FP1-23): codes + share links, ?ref= capture into cookies,
// a Referral recorded at sign-up (patient / doctor / nurse register) with the
// abuse guards (own device, a device already used, no device cookie, a
// mobile number referred before), the reward — once — on a referred
// patient's first paid + completed visit (not with the referrer themself,
// not a ₹0 visit) or on a referred provider's approval, idempotent under
// retries and parallel calls, the per-referrer monthly cap (also under a
// race), the programme off at ₹0 (no tracking, no reward, the sweep pays it
// once it's on again), the admin settings + report, and the pages.
// Starts its own dev server (BASE_URL to use a running one) against the DB in
// .env, throwaway users only; the platform's referral settings are restored
// at the end. Firebase is unset, so no push leaves the machine (inbox rows only).
//
//   npm run test:referrals
import "dotenv/config";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import type { ChildProcess } from "child_process";
import { prisma } from "../src/lib/prisma";
import { normalizeReferralCode, rewardPatientReferral, rewardProviderReferral, sweepDueReferrals } from "../src/lib/referrals";
import { deleteAccount } from "../src/lib/userDeletion";
import { startDevServer } from "./devServer";

for (const k of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) process.env[k] = "";

let BASE = process.env.BASE_URL ?? "";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string };
const tokenFor = (u: U) => jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET);
let ipN = 0;
const ip = () => `10.77.${Math.floor(++ipN / 250)}.${ipN % 250}`;
async function http(method: string, path: string, opts: { as?: U; cookies?: string[]; body?: unknown } = {}) {
  const cookie = [...(opts.as ? [`doconclick_token=${tokenFor(opts.as)}`] : []), ...(opts.cookies ?? [])].join("; ");
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json", "X-Real-IP": ip() },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: J = {};
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, setCookie: res.headers.getSetCookie(), text };
}
const cookieValue = (setCookie: string[], name: string) => setCookie.find((c) => c.startsWith(`${name}=`))?.split(";")[0].slice(name.length + 1) ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const until = Date.now() + ms;
  let v = await fn();
  while (!ok(v) && Date.now() < until) { await sleep(200); v = await fn(); }
  return v;
}

async function main() {
  check("normalizeReferralCode: trims/uppercases, refuses junk", normalizeReferralCode(" ab3defgh ") === "AB3DEFGH" && normalizeReferralCode("abc") === null && normalizeReferralCode("AB0DEFGH") === null && normalizeReferralCode("<script>") === null && normalizeReferralCode(42) === null, "ok");

  let child: ChildProcess | null = null;
  if (!BASE) {
    const started = await startDevServer({ label: "fp123b", env: { FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" } });
    child = started.child;
    BASE = started.base;
  }

  const settingsRow = (await prisma.platformSettings.findFirst()) ?? (await prisma.platformSettings.create({ data: {} }));
  const original = { referralRewardPatient: settingsRow.referralRewardPatient, referralRewardProvider: settingsRow.referralRewardProvider, referralMonthlyCap: settingsRow.referralMonthlyCap };
  const setRewards = (data: { referralRewardPatient?: number; referralRewardProvider?: number; referralMonthlyCap?: number }) =>
    prisma.platformSettings.update({ where: { id: settingsRow.id }, data });

  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mobile = () => `9${stamp}${String(n++).padStart(2, "0")}`;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: mobile(), termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const approvedDoctor = { create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY) } };
  const refOf = (inviteeId: string) => prisma.referral.findUnique({ where: { inviteeId } });
  const walletOf = async (userId: string) => (await prisma.wallet.findUnique({ where: { userId } }))?.balance ?? 0;
  const bonusRows = (userId: string) => prisma.walletTransaction.findMany({ where: { type: "REFERRAL_BONUS", wallet: { userId } } });

  // Sign up through an invite link the way the browser does: capture first, then register with its cookies.
  const signUp = async (kind: "patients" | "doctors" | "nurses", code: string | null, device: string | null, fixedMobile?: string) => {
    const cookies = [...(code ? [`doconclick_ref=${code}`] : []), ...(device ? [`doconclick_did=${device}`] : [])];
    const m = fixedMobile ?? mobile();
    const body = kind === "patients" ? { mobile: m, password: "secret123" } : { name: `Ref ${kind} ${n}`, mobile: m, password: "secret123" };
    const r = await http("POST", `/api/${kind}/register`, { cookies, body });
    if (r.json.id) ids.push(String(r.json.id));
    return { ...r, id: String(r.json.id ?? ""), mobile: m };
  };
  const paidVisit = (patientId: string, doctorId: string, extra: Record<string, unknown> = {}) =>
    prisma.appointment.create({ data: { patientId, doctorId, symptoms: "REF-TEST", consultType: "CLINIC", status: "COMPLETED", paymentMethod: "ONLINE", paymentStatus: "PAID", paidAt: new Date(), completedAt: new Date(), amount: 400, ...extra } });

  try {
    await setRewards({ referralRewardPatient: 50, referralRewardProvider: 100, referralMonthlyCap: 2 });
    const admin = await mk({ name: "Ref Admin", role: "ADMIN" });
    const referrer = await mk({ name: "Ref Asha", role: "PATIENT", password: "x", language: "mr-IN", patientProfile: { create: { age: 40, gender: "Female" } } });
    const doctor = await mk({ name: "Ref Visit Doctor", role: "DOCTOR", doctorProfile: approvedDoctor });
    const doctorReferrer = await mk({ name: "Ref Doctor Referrer", role: "DOCTOR", doctorProfile: approvedDoctor });
    const nurseReferrer = await mk({ name: "Ref Nurse Referrer", role: "NURSE", nurseProfile: { create: { status: "APPROVED" } } });

    // ── Invite card ──
    let r = await http("GET", "/api/referrals/me", { as: referrer });
    const code = String(r.json.code ?? "");
    const referrerDevice = cookieValue(r.setCookie, "doconclick_did");
    check("patient opens the invite card → code, ₹50, patient link only, device cookie set", r.status === 200 && r.json.enabled === true && /^[A-Z2-9]{8}$/.test(code) && r.json.amount === 50
      && (r.json.links as Record<string, string>).patient?.endsWith(`/patient/register?ref=${code}`) && !(r.json.links as Record<string, string>).doctor && !!referrerDevice, `${r.status} ${code} ${JSON.stringify(r.json.links)}`);
    const again = await http("GET", "/api/referrals/me", { as: referrer, cookies: [`doconclick_did=${referrerDevice}`] });
    check("…same code next time, device remembered as theirs", again.json.code === code && (await prisma.referralCode.findUnique({ where: { userId: referrer.id } }))?.deviceId === referrerDevice, `${again.json.code}`);
    r = await http("GET", "/api/referrals/me", { as: doctorReferrer });
    const doctorCode = String(r.json.code ?? "");
    check("doctor's card → ₹100, doctor + nurse links", r.json.amount === 100 && !!(r.json.links as Record<string, string>).doctor?.includes("/doctor/register?ref=") && !!(r.json.links as Record<string, string>).nurse?.includes("/nurse/register?ref="), JSON.stringify(r.json.links));
    const nurseCode = String((await http("GET", "/api/referrals/me", { as: nurseReferrer })).json.code ?? "");
    r = await http("GET", "/api/referrals/me", { as: admin });
    check("admin → 403; signed out → 401", r.status === 403 && (await http("GET", "/api/referrals/me")).status === 401, `${r.status}`);

    // ── Capture ──
    r = await http("POST", "/api/referrals/capture", { body: { code: code.toLowerCase() } });
    check("capture a valid code → ok, httpOnly ref + device cookies", r.json.ok === true && cookieValue(r.setCookie, "doconclick_ref") === code && !!cookieValue(r.setCookie, "doconclick_did") && r.setCookie.every((c) => /HttpOnly/i.test(c)), r.setCookie.join(" | "));
    r = await http("POST", "/api/referrals/capture", { body: { code: "ZZZZ2222" } });
    check("unknown code → ok:false, no cookie", r.json.ok === false && !cookieValue(r.setCookie, "doconclick_ref"), `${r.json.ok}`);
    r = await http("POST", "/api/referrals/capture", { body: "nope" });
    check("garbage body → ok:false", r.status === 200 && r.json.ok === false, `${r.status}`);

    // ── Sign-ups and abuse guards ──
    const d1 = randomUUID();
    const i1 = await signUp("patients", code, d1);
    let ref = await refOf(i1.id);
    check("patient signs up from the link → PENDING referral for the referrer", i1.status === 200 && ref?.status === "PENDING" && ref.referrerId === referrer.id && ref.inviteeRole === "PATIENT" && !!ref.mobileHash && !ref.mobileHash.includes(i1.mobile), `${i1.status} ${ref?.status}`);
    check("…the ref cookie is cleared on the response", i1.setCookie.some((c) => /^doconclick_ref=;/.test(c)), i1.setCookie.join(" | "));
    const i2 = await signUp("patients", code, d1);
    check("second account from the same device → REJECTED SAME_DEVICE", (await refOf(i2.id))?.rejectReason === "SAME_DEVICE", `${(await refOf(i2.id))?.status}`);
    const i3 = await signUp("patients", code, referrerDevice);
    check("account made on the referrer's own device → REJECTED SAME_DEVICE", (await refOf(i3.id))?.rejectReason === "SAME_DEVICE", `${(await refOf(i3.id))?.rejectReason}`);
    const i4 = await signUp("patients", code, null);
    check("no device cookie → REJECTED NO_DEVICE", (await refOf(i4.id))?.rejectReason === "NO_DEVICE", `${(await refOf(i4.id))?.rejectReason}`);
    const i5 = await signUp("patients", code, randomUUID());
    const i5Ref = await refOf(i5.id);
    await deleteAccount(i5.id, "PATIENT");
    const i5b = await signUp("patients", code, randomUUID(), i5.mobile);
    check("delete + sign up again with the same number → REJECTED SAME_MOBILE", i5b.status === 200 && (await refOf(i5b.id))?.rejectReason === "SAME_MOBILE", `${i5b.status} ${(await refOf(i5b.id))?.rejectReason}`);
    const plain = await signUp("patients", null, randomUUID());
    check("sign-up without a link → no referral", plain.status === 200 && !(await refOf(plain.id)), "none");
    check("one row per invitee (inviteeId unique)", await prisma.referral.count({ where: { inviteeId: i1.id } }) === 1, "1");

    // ── Reward on the first paid + completed visit ──
    const free = await paidVisit(i1.id, doctor.id, { amount: 0 });
    let out = await rewardPatientReferral(i1.id);
    check("a ₹0 visit doesn't count", out.outcome === "SKIPPED" && (await refOf(i1.id))?.status === "PENDING", out.outcome);
    await prisma.appointment.delete({ where: { id: free.id } });
    const visit = await prisma.appointment.create({ data: { patientId: i1.id, doctorId: doctor.id, symptoms: "REF-TEST", consultType: "CLINIC", status: "SCHEDULED", paymentMethod: "CASH", amount: 300, scheduledAt: new Date(Date.now() - 3600e3) } });
    r = await http("POST", `/api/appointments/${visit.id}/complete`, { as: doctor, body: { doctorNotes: "ok" } });
    ref = await waitFor(() => refOf(i1.id), (x) => x?.status === "REWARDED");
    check("doctor completes the paid (cash) visit → REWARDED ₹50, linked to that visit", r.status === 200 && ref?.status === "REWARDED" && ref.rewardAmount === 50 && ref.qualifyingAppointmentId === visit.id && !!ref.walletTransactionId, `${r.status} ${ref?.status}`);
    let rows = await bonusRows(referrer.id);
    check("…referrer's wallet +₹50 with one REFERRAL_BONUS ledger row", (await walletOf(referrer.id)) === 50 && rows.length === 1 && rows[0].referralId === ref?.id && rows[0].balanceAfter === 50 && rows[0].id === ref?.walletTransactionId, `${await walletOf(referrer.id)} ${rows.length}`);
    const note = await waitFor(() => prisma.notification.findFirst({ where: { userId: referrer.id, kind: "referralRewarded" } }), (x) => !!x);
    check("…Marathi push/inbox, Latin digits, to the wallet", /बक्षीस/.test(note?.title ?? "") && /₹50/.test(note?.body ?? "") && note?.url === "/patient/wallet", `${note?.title} | ${note?.body}`);
    const results = await Promise.all(Array.from({ length: 5 }, () => rewardPatientReferral(i1.id)));
    rows = await bonusRows(referrer.id);
    check("retries (5 in parallel) → nothing more", results.every((x) => x.outcome === "SKIPPED") && rows.length === 1 && (await walletOf(referrer.id)) === 50, `${results.map((x) => x.outcome)} ${rows.length}`);
    r = await http("GET", "/api/wallet/me", { as: referrer });
    check("patient wallet API lists the REFERRAL_BONUS credit", ((r.json.transactions as { type: string }[]) ?? []).some((x) => x.type === "REFERRAL_BONUS"), `${r.status}`);

    // Concurrency on a fresh invitee: one reward only.
    const i6 = await signUp("patients", code, randomUUID());
    await paidVisit(i6.id, doctor.id);
    const race = await Promise.all(Array.from({ length: 6 }, () => rewardPatientReferral(i6.id)));
    check("6 parallel rewards for one invitee → exactly one REWARDED, one ledger row", race.filter((x) => x.outcome === "REWARDED").length === 1 && (await bonusRows(referrer.id)).length === 2 && (await walletOf(referrer.id)) === 100, `${race.map((x) => x.outcome)}`);

    // ── Monthly cap (2): a third is refused; with one slot left, two racing → one ──
    const i7 = await signUp("patients", code, randomUUID());
    await paidVisit(i7.id, doctor.id);
    out = await rewardPatientReferral(i7.id);
    check("cap reached → REJECTED MONTHLY_CAP, wallet unchanged", out.outcome === "REJECTED" && (await refOf(i7.id))?.rejectReason === "MONTHLY_CAP" && (await walletOf(referrer.id)) === 100, out.outcome);
    await setRewards({ referralMonthlyCap: 3 });
    const i8 = await signUp("patients", code, randomUUID());
    const i9 = await signUp("patients", code, randomUUID());
    await paidVisit(i8.id, doctor.id);
    await paidVisit(i9.id, doctor.id);
    const pair = await Promise.all([rewardPatientReferral(i8.id), rewardPatientReferral(i9.id)]);
    check("one slot left, two invitees at once → one REWARDED, one MONTHLY_CAP", pair.map((x) => x.outcome).sort().join(",") === "REJECTED,REWARDED" && (await walletOf(referrer.id)) === 150 && (await prisma.referral.count({ where: { referrerId: referrer.id, status: "REWARDED" } })) === 3, `${pair.map((x) => x.outcome)}`);
    await setRewards({ referralMonthlyCap: 10 });

    // ── A doctor's patient invitee: a visit with the referrer themself doesn't count ──
    const i10 = await signUp("patients", doctorCode, randomUUID());
    await paidVisit(i10.id, doctorReferrer.id);
    out = await rewardPatientReferral(i10.id);
    check("referred patient's visit with the referring doctor → no reward", out.outcome === "SKIPPED" && (await refOf(i10.id))?.status === "PENDING", out.outcome);
    await paidVisit(i10.id, doctor.id);
    out = await rewardPatientReferral(i10.id);
    check("…a paid visit with another doctor → doctor's wallet +₹50", out.outcome === "REWARDED" && (await walletOf(doctorReferrer.id)) === 50, out.outcome);

    // ── First rewards to a referrer with no wallet yet, all at once → one wallet, every credit ──
    const fresh = await mk({ name: "Ref Fresh", role: "PATIENT", password: "x", patientProfile: { create: { age: 33, gender: "Male" } } });
    const freshCode = String((await http("GET", "/api/referrals/me", { as: fresh })).json.code ?? "");
    const trio = [await signUp("patients", freshCode, randomUUID()), await signUp("patients", freshCode, randomUUID()), await signUp("patients", freshCode, randomUUID())];
    for (const t of trio) await paidVisit(t.id, doctor.id);
    check("…referrer has no wallet yet", !(await prisma.wallet.findUnique({ where: { userId: fresh.id } })), "none");
    const trioOut = await Promise.all(trio.map((t) => rewardPatientReferral(t.id)));
    check("3 first-ever rewards in parallel → all REWARDED, one wallet ₹150, 3 ledger rows", trioOut.every((x) => x.outcome === "REWARDED")
      && (await prisma.wallet.count({ where: { userId: fresh.id } })) === 1 && (await walletOf(fresh.id)) === 150 && (await bonusRows(fresh.id)).length === 3, `${trioOut.map((x) => x.outcome)} ${await walletOf(fresh.id)}`);

    // ── A nurse visit counts too (not with the referring nurse herself) ──
    const nurseVisit = { providerType: "NURSE", consultType: "HOME" };
    const i11 = await signUp("patients", freshCode, randomUUID());
    await paidVisit(i11.id, nurseReferrer.id, nurseVisit);
    out = await rewardPatientReferral(i11.id);
    check("referred patient's first paid nurse visit → REWARDED", out.outcome === "REWARDED" && (await refOf(i11.id))?.qualifyingAppointmentId != null, out.outcome);
    const i12 = await signUp("patients", nurseCode, randomUUID());
    await paidVisit(i12.id, nurseReferrer.id, nurseVisit);
    out = await rewardPatientReferral(i12.id);
    check("…a visit with the referring nurse herself → no reward", out.outcome === "SKIPPED" && (await refOf(i12.id))?.status === "PENDING", out.outcome);

    // ── Sweep: ineligible "looks due" rows don't starve an eligible one ──
    for (let k = 0; k < 3; k++) {
      const x = await signUp("patients", nurseCode, randomUUID());
      await paidVisit(x.id, nurseReferrer.id, nurseVisit); // only with the referrer → never qualifies
    }
    const eligible = await signUp("patients", freshCode, randomUUID());
    await paidVisit(eligible.id, doctor.id);
    const looksDue = await prisma.referral.count({ where: { status: "PENDING", inviteeRole: "PATIENT", invitee: { asPatient: { some: { status: "COMPLETED", paymentStatus: "PAID", amount: { gt: 0 } } } } } });
    const maxSweeps = Math.ceil(looksDue / 2);
    let sweeps = 0;
    while (sweeps < maxSweeps && (await refOf(eligible.id))?.status !== "REWARDED") { await sweepDueReferrals({ batch: 2 }); sweeps++; }
    check(`sweep (batch 2, ${looksDue} look due, 4 never qualify, eligible newest) → paid within ${maxSweeps} runs`, (await refOf(eligible.id))?.status === "REWARDED", `${sweeps} run(s) ${(await refOf(eligible.id))?.status}`);
    check("…the ineligible rows were stamped and stay PENDING", (await refOf(i12.id))?.status === "PENDING" && (await refOf(i12.id))?.lastCheckedAt != null, `${(await refOf(i12.id))?.lastCheckedAt}`);

    // ── Providers: reward on admin approval ──
    const dInv = await signUp("doctors", nurseCode, randomUUID());
    ref = await refOf(dInv.id);
    check("doctor signs up from a nurse's link → PENDING (DOCTOR)", dInv.status === 200 && ref?.status === "PENDING" && ref.inviteeRole === "DOCTOR" && ref.referrerId === nurseReferrer.id, `${dInv.status} ${ref?.status}`);
    out = await rewardProviderReferral(dInv.id);
    check("…not approved yet → nothing", out.outcome === "SKIPPED", out.outcome);
    await prisma.doctorProfile.update({ where: { userId: dInv.id }, data: { medRegNo: "MMC-REF-1", medRegCertUrl: "https://example.invalid/c.pdf", kycDocUrl: "https://example.invalid/k.pdf", registrationFeePaid: true } });
    r = await http("PATCH", `/api/admin/doctors/${dInv.id}`, { as: admin, body: { status: "APPROVED" } });
    ref = await refOf(dInv.id);
    check("admin approves the doctor → REWARDED ₹100 to the nurse's wallet", r.status === 200 && ref?.status === "REWARDED" && ref.rewardAmount === 100 && (await walletOf(nurseReferrer.id)) === 100, `${r.status} ${r.json.error ?? ""} ${ref?.status}`);
    const nNote = await prisma.notification.findFirst({ where: { userId: nurseReferrer.id, kind: "referralRewarded" } });
    check("…push to the nurse links to her profile", nNote?.url === "/nurse/profile", `${nNote?.url}`);
    out = await rewardProviderReferral(dInv.id);
    check("…approving again / retry → nothing more", out.outcome === "SKIPPED" && (await bonusRows(nurseReferrer.id)).length === 1, out.outcome);

    // Programme off when the trigger happens → stays PENDING; the sweep pays it once it's on.
    const nInv = await signUp("nurses", nurseCode, randomUUID());
    check("nurse signs up from the link → PENDING (NURSE)", (await refOf(nInv.id))?.inviteeRole === "NURSE" && (await refOf(nInv.id))?.status === "PENDING", `${nInv.status}`);
    await setRewards({ referralRewardProvider: 0 });
    await prisma.nurseProfile.update({ where: { userId: nInv.id }, data: { status: "APPROVED" } });
    out = await rewardProviderReferral(nInv.id);
    check("provider reward ₹0 at approval → SKIPPED, still PENDING", out.outcome === "SKIPPED" && (await refOf(nInv.id))?.status === "PENDING", out.outcome);
    r = await http("GET", "/api/referrals/me", { as: nurseReferrer });
    check("…and the provider invite card is hidden", r.json.enabled === false && !("code" in r.json), JSON.stringify(r.json));
    await setRewards({ referralRewardProvider: 100 });
    await sweepDueReferrals();
    check("turned back on → the sweep pays it (₹100)", (await refOf(nInv.id))?.status === "REWARDED" && (await walletOf(nurseReferrer.id)) === 200, `${(await refOf(nInv.id))?.status}`);

    // ── Off: both ₹0 → no capture, no tracking, no card ──
    await setRewards({ referralRewardPatient: 0, referralRewardProvider: 0 });
    r = await http("POST", "/api/referrals/capture", { body: { code } });
    const offSignup = await signUp("patients", code, randomUUID());
    const offCard = await http("GET", "/api/referrals/me", { as: referrer });
    check("programme off → capture refused, sign-up not tracked, card hidden", r.json.ok === false && !(await refOf(offSignup.id)) && offCard.json.enabled === false, `${r.json.ok} ${offCard.json.enabled}`);
    await setRewards({ referralRewardPatient: 50, referralRewardProvider: 100 });

    // ── Admin settings + report ──
    for (const [body, label] of [[{ referralRewardPatient: -1 }, "-₹1"], [{ referralRewardProvider: 5001 }, "₹5001"], [{ referralMonthlyCap: 0 }, "cap 0"], [{ referralMonthlyCap: 2.5 }, "cap 2.5"], [{ referralRewardPatient: "50" }, "a string"]] as const) {
      r = await http("PATCH", "/api/admin/settings", { as: admin, body });
      check(`settings: ${label} → 400`, r.status === 400, `${r.status} ${r.json.error}`);
    }
    r = await http("PATCH", "/api/admin/settings", { as: admin, body: { referralRewardPatient: 75, referralRewardProvider: 150, referralMonthlyCap: 5 } });
    check("settings: valid → saved", r.status === 200 && r.json.referralRewardPatient === 75 && r.json.referralMonthlyCap === 5, `${r.status}`);
    r = await http("PATCH", "/api/admin/settings", { as: referrer, body: { referralRewardPatient: 999 } });
    check("settings as a patient → 403", r.status === 403, `${r.status}`);

    r = await http("GET", "/api/admin/reports/referrals", { as: admin });
    const mine = ((r.json.rows as { id: string; referrerName: string; status: string; rejectReason: string | null; inviteeMobile: string | null }[]) ?? []).filter((x) => ["Ref Asha", "Ref Doctor Referrer", "Ref Nurse Referrer", "Ref Fresh"].includes(x.referrerName));
    const summary = r.json.summary as Record<string, number>;
    check("report: our 22 referrals, statuses and reasons, summary totals", r.status === 200 && mine.length === 22 && mine.filter((x) => x.status === "REWARDED").length === 11
      && mine.some((x) => x.rejectReason === "SAME_MOBILE") && summary.conversions >= 11 && summary.payout >= 650, `${r.status} ${mine.length} ${JSON.stringify(summary)}`);
    const deletedRow = mine.find((x) => x.id === i5Ref?.id);
    check("…a deleted invitee's row stays, without the number", !!deletedRow && deletedRow.inviteeMobile === null, `${deletedRow?.inviteeMobile}`);
    r = await http("GET", "/api/admin/reports/referrals?status=REWARDED", { as: admin });
    check("report: status filter", ((r.json.rows as { status: string }[]) ?? []).every((x) => x.status === "REWARDED"), `${r.status}`);
    check("report: bad status / bad date → 400; patient → 403",
      (await http("GET", "/api/admin/reports/referrals?status=NOPE", { as: admin })).status === 400 && (await http("GET", "/api/admin/reports/referrals?from=2026-13-01", { as: admin })).status === 400
      && (await http("GET", "/api/admin/reports/referrals", { as: referrer })).status === 403, "ok");

    // ── Pages ──
    for (const [path, who] of [["/patient/profile", referrer], ["/doctor/profile", doctorReferrer], ["/nurse/profile", nurseReferrer], ["/admin/finance?tab=referrals", admin], ["/admin/reports/referrals", admin], ["/patient/wallet", referrer]] as const) {
      r = await http("GET", path, { as: who });
      check(`${path} renders`, r.status === 200, `${r.status}`);
    }
    for (const path of [`/patient/register?ref=${code}`, `/doctor/register?ref=${nurseCode}`, `/nurse/register?ref=${nurseCode}`]) {
      r = await http("GET", path);
      check(`${path} renders signed out`, r.status === 200, `${r.status}`);
    }
  } finally {
    await prisma.platformSettings.update({ where: { id: settingsRow.id }, data: original });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { inviteeId: { in: ids } }] } });
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    child?.kill("SIGTERM");
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
