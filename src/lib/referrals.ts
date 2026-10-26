import { createHmac, randomInt, randomUUID } from "crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { COOKIE_SECURE } from "@/lib/auth";
import { getOrCreateWallet } from "@/lib/wallet";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { netPayable } from "@/lib/coupons";
import { money } from "@/lib/money";
import { istMonthKey, istStartOfMonth } from "@/lib/istDate";
import { SITE_URL } from "@/lib/seo";
import { REFERRAL_CAP_MIN } from "@/lib/referralLimits";

// Invite & earn (FP1-23). A patient, doctor or nurse shares a link with
// their code (/patient|doctor|nurse/register?ref=CODE). The register page
// posts the code to /api/referrals/capture, which keeps it in an httpOnly
// cookie with a device cookie; whichever sign-up path creates the account
// (form or Google) records a Referral for it. The referrer's wallet is
// credited — once — when the invitee completes a first paid visit
// (patient) or is approved by an admin (doctor/nurse). Amounts are admin
// settings; ₹0 switches that side off.

export const REFERRAL_COOKIE = "doconclick_ref";
export const DEVICE_COOKIE = "doconclick_did";
export const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const DEVICE_COOKIE_MAX_AGE = 2 * 365 * 24 * 60 * 60; // 2 years

export const REFERRAL_STATUSES = ["PENDING", "REWARDED", "REJECTED"] as const;
export const REJECT_REASONS = ["SAME_MOBILE", "SAME_DEVICE", "NO_DEVICE", "MONTHLY_CAP", "ACCOUNT_DELETED"] as const;
type RejectReason = (typeof REJECT_REASONS)[number];

/** Who can share a code, and whose sign-up can count as an invitee. */
export const REFERRAL_ROLES = ["PATIENT", "DOCTOR", "NURSE"] as const;
const isReferralRole = (role: string) => (REFERRAL_ROLES as readonly string[]).includes(role);

const DEFAULT_MONTHLY_CAP = 10;

// No 0/O/1/I — read aloud or typed from a WhatsApp message.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_RE = /^[A-Z2-9]{6,12}$/;
const DEVICE_RE = /^[0-9a-f-]{36}$/;

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

function newCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export function validDeviceId(raw: unknown): string | null {
  return typeof raw === "string" && DEVICE_RE.test(raw) ? raw : null;
}

export function newDeviceId(): string {
  return randomUUID();
}

export const deviceCookieOptions = { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax" as const, maxAge: DEVICE_COOKIE_MAX_AGE, path: "/" };
export const referralCookieOptions = { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax" as const, maxAge: REFERRAL_COOKIE_MAX_AGE, path: "/" };

// A keyed hash, not the number: Referral rows outlive an account deletion
// (which frees the number), and are only ever compared for equality. The key
// is derived from JWT_SECRET for this one purpose — never a built-in default,
// which would make the 10-digit numbers trivially brute-forceable.
let mobileHashKey: Buffer | null = null;
function hashMobile(mobile: string | null | undefined): string | null {
  if (!mobile || !/^\d{10}$/.test(mobile)) return null; // pending_… (Google, no number yet) / deleted_…
  if (!mobileHashKey) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");
    mobileHashKey = createHmac("sha256", secret).update("referral-mobile-v1").digest();
  }
  return createHmac("sha256", mobileHashKey).update(mobile).digest("hex");
}

export type ReferralSettings = { patient: number; provider: number; monthlyCap: number };

const cleanAmount = (v: unknown) => {
  const n = money(v);
  return n > 0 ? n : 0;
};

export async function getReferralSettings(client: PrismaClientOrTx = prisma): Promise<ReferralSettings> {
  const s = await client.platformSettings.findFirst({
    select: { referralRewardPatient: true, referralRewardProvider: true, referralMonthlyCap: true },
  });
  const cap = s?.referralMonthlyCap;
  return {
    patient: cleanAmount(s?.referralRewardPatient),
    provider: cleanAmount(s?.referralRewardProvider),
    monthlyCap: typeof cap === "number" && cap >= REFERRAL_CAP_MIN ? cap : DEFAULT_MONTHLY_CAP,
  };
}

/** The reward for one invitee of this role (₹0 = that side is off). */
export function rewardFor(settings: ReferralSettings, inviteeRole: string): number {
  if (inviteeRole === "PATIENT") return settings.patient;
  if (inviteeRole === "DOCTOR" || inviteeRole === "NURSE") return settings.provider;
  return 0;
}

export const referralProgramOn = (s: ReferralSettings) => s.patient > 0 || s.provider > 0;

/** The user's code, made on first use. `deviceId` is remembered as theirs. */
export async function ensureReferralCode(userId: string, deviceId: string | null): Promise<string> {
  const existing = await prisma.referralCode.findUnique({ where: { userId } });
  if (existing) {
    if (deviceId && existing.deviceId !== deviceId) {
      await prisma.referralCode.update({ where: { userId }, data: { deviceId } });
    }
    return existing.code;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.referralCode.create({ data: { userId, code: newCode(), deviceId } });
      return created.code;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Either a code clash (try another) or a parallel request made theirs.
      const raced = await prisma.referralCode.findUnique({ where: { userId } });
      if (raced) return raced.code;
    }
  }
  throw new Error("Could not allocate a referral code");
}

const isUniqueViolation = (err: unknown) => !!err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002";

export function referralLinks(code: string) {
  const link = (path: string) => `${SITE_URL}${path}?ref=${encodeURIComponent(code)}`;
  return { patient: link("/patient/register"), doctor: link("/doctor/register"), nurse: link("/nurse/register") };
}

/** The code + device cookies the register page left (src/app/api/referrals/capture). */
export async function readReferralCookies(): Promise<{ code: string | null; deviceId: string | null }> {
  const store = await cookies();
  return {
    code: normalizeReferralCode(store.get(REFERRAL_COOKIE)?.value),
    deviceId: validDeviceId(store.get(DEVICE_COOKIE)?.value),
  };
}

/**
 * Records that a just-created account came from someone's link. Never
 * throws — a referral problem must not fail a sign-up. Abuse guards: the
 * code owner's own device (or any device another account already used for
 * referrals or its own invite card), a mobile number that was already
 * referred once (e.g. delete + sign up again), and no device cookie at all
 * are kept as REJECTED rows so the admin can see them.
 */
export async function recordReferralSignup(
  invitee: { id: string; role: string; mobile: string },
  ctx: { code: string | null; deviceId: string | null },
): Promise<void> {
  try {
    const code = normalizeReferralCode(ctx.code);
    if (!code || !isReferralRole(invitee.role)) return;
    if (rewardFor(await getReferralSettings(), invitee.role) <= 0) return; // programme off for this kind of invitee

    const owner = await prisma.referralCode.findUnique({
      where: { code },
      select: { userId: true, deviceId: true, user: { select: { role: true, deletedAt: true } } },
    });
    if (!owner || owner.user.deletedAt || !isReferralRole(owner.user.role) || owner.userId === invitee.id) return;

    const mobileHash = hashMobile(invitee.mobile);
    const deviceId = validDeviceId(ctx.deviceId);
    let rejectReason: RejectReason | null = null;
    if (!deviceId) {
      rejectReason = "NO_DEVICE";
    } else if (
      deviceId === owner.deviceId
      || (await prisma.referralCode.count({ where: { deviceId } })) > 0
      || (await prisma.referral.count({ where: { deviceId } })) > 0
    ) {
      rejectReason = "SAME_DEVICE";
    } else if (mobileHash && (await prisma.referral.count({ where: { mobileHash } })) > 0) {
      rejectReason = "SAME_MOBILE";
    }

    await prisma.referral.create({
      data: {
        referrerId: owner.userId,
        inviteeId: invitee.id,
        inviteeRole: invitee.role,
        status: rejectReason ? "REJECTED" : "PENDING",
        rejectReason,
        mobileHash,
        deviceId,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) console.error("Recording a referral sign-up failed:", err);
  }
}

export type RewardOutcome =
  | { outcome: "REWARDED"; amount: number; balance: number }
  | { outcome: "REJECTED"; reason: RejectReason }
  | { outcome: "SKIPPED" };
const SKIPPED: RewardOutcome = { outcome: "SKIPPED" };

const REFERRER_HOME: Record<string, string> = {
  PATIENT: "/patient/wallet",
  DOCTOR: "/doctor/profile",
  NURSE: "/nurse/profile",
};

async function ensureWallet(userId: string): Promise<void> {
  try {
    await getOrCreateWallet(prisma, userId);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    await prisma.wallet.findUniqueOrThrow({ where: { userId }, select: { id: true } });
  }
}

/**
 * Pays one PENDING referral, all in one transaction: the referrer's wallet
 * row is locked first (so every reward to the same referrer runs one after
 * another and the monthly count is exact), the Referral is claimed
 * PENDING → REWARDED with a conditional update (a retry or a parallel call
 * claims nothing and credits nothing), and the balance + REFERRAL_BONUS
 * ledger row are written with it. Amount is the admin setting right now.
 */
async function rewardReferral(referralId: string, qualifyingAppointmentId: string | null): Promise<RewardOutcome> {
  const settings = await getReferralSettings();
  const ref = await prisma.referral.findUnique({
    where: { id: referralId },
    include: {
      referrer: { select: { role: true, deletedAt: true } },
      invitee: { select: { mobile: true, deletedAt: true } },
    },
  });
  if (!ref || ref.status !== "PENDING") return SKIPPED;
  const amount = rewardFor(settings, ref.inviteeRole);
  if (amount <= 0) return SKIPPED; // switched off: stays PENDING
  // A Google sign-up had no number yet when the referral was recorded.
  const mobileHash = ref.mobileHash ?? hashMobile(ref.invitee.mobile);

  // Made before the transaction: two first-ever rewards to the same referrer
  // can race to create it, and the loser's unique-violation would abort the
  // transaction — here it just re-reads the winner's row.
  await ensureWallet(ref.referrerId);
  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Wallet" WHERE "userId" = ${ref.referrerId} FOR UPDATE`;
    if (locked.length !== 1) throw new Error("Referrer wallet missing");
    const wallet = locked[0];

    const reject = async (reason: RejectReason): Promise<RewardOutcome> => {
      const { count } = await tx.referral.updateMany({
        where: { id: ref.id, status: "PENDING" },
        data: { status: "REJECTED", rejectReason: reason, mobileHash },
      });
      return count ? { outcome: "REJECTED", reason } : SKIPPED;
    };

    if (ref.referrer.deletedAt || ref.invitee.deletedAt) return reject("ACCOUNT_DELETED");
    if (mobileHash && (await tx.referral.count({ where: { mobileHash, status: "REWARDED", id: { not: ref.id } } })) > 0) {
      return reject("SAME_MOBILE");
    }
    const monthStart = istStartOfMonth(istMonthKey(new Date()));
    const usedThisMonth = await tx.referral.count({ where: { referrerId: ref.referrerId, status: "REWARDED", rewardedAt: { gte: monthStart } } });
    if (usedThisMonth >= settings.monthlyCap) return reject("MONTHLY_CAP");

    const { count } = await tx.referral.updateMany({
      where: { id: ref.id, status: "PENDING" },
      data: { status: "REWARDED", rewardAmount: amount, rewardedAt: new Date(), mobileHash, qualifyingAppointmentId },
    });
    if (count === 0) return SKIPPED;
    const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    const txn = await tx.walletTransaction.create({
      data: { walletId: wallet.id, type: "REFERRAL_BONUS", amount, balanceAfter: updated.balance, status: "SUCCESS", referralId: ref.id },
    });
    await tx.referral.update({ where: { id: ref.id }, data: { walletTransactionId: txn.id } });
    return { outcome: "REWARDED", amount, balance: updated.balance } as RewardOutcome;
  });

  if (result.outcome === "REWARDED") {
    void sendPushToUser(ref.referrerId, {
      key: "referralRewarded",
      values: { amount: result.amount },
      url: REFERRER_HOME[ref.referrer.role] ?? "/",
    });
  }
  return result;
}

/**
 * A referred patient's first paid + completed visit pays their referrer.
 * Called after a visit is completed (and by the sweep). Doctor or nurse
 * visit alike (both keep the provider in doctorId); it must have cost
 * something after any coupon, and not be with the referrer themself.
 */
export async function rewardPatientReferral(patientId: string): Promise<RewardOutcome> {
  try {
    const ref = await prisma.referral.findUnique({ where: { inviteeId: patientId }, select: { id: true, status: true, inviteeRole: true, referrerId: true } });
    if (!ref || ref.status !== "PENDING" || ref.inviteeRole !== "PATIENT") return SKIPPED;
    const visits = await prisma.appointment.findMany({
      where: { patientId, status: "COMPLETED", paymentStatus: "PAID", doctorId: { not: ref.referrerId } },
      orderBy: [{ completedAt: "asc" }, { scheduledAt: "asc" }],
      select: { id: true, amount: true, discountAmount: true },
      take: 20,
    });
    const first = visits.find((v) => netPayable(v) > 0);
    if (!first) return SKIPPED;
    return await rewardReferral(ref.id, first.id);
  } catch (err) {
    console.error("Referral reward (patient) failed:", err);
    return SKIPPED;
  }
}

/** A referred doctor/nurse pays their referrer once an admin approves them. */
export async function rewardProviderReferral(providerId: string): Promise<RewardOutcome> {
  try {
    const ref = await prisma.referral.findUnique({
      where: { inviteeId: providerId },
      select: {
        id: true, status: true, inviteeRole: true,
        invitee: { select: { doctorProfile: { select: { status: true } }, nurseProfile: { select: { status: true } } } },
      },
    });
    if (!ref || ref.status !== "PENDING") return SKIPPED;
    const approved = ref.inviteeRole === "DOCTOR"
      ? ref.invitee.doctorProfile?.status === "APPROVED"
      : ref.inviteeRole === "NURSE" && ref.invitee.nurseProfile?.status === "APPROVED";
    if (!approved) return SKIPPED;
    return await rewardReferral(ref.id, null);
  } catch (err) {
    console.error("Referral reward (provider) failed:", err);
    return SKIPPED;
  }
}

/**
 * Safety net run with the reminder sweep (src/instrumentation.ts): pays any
 * referral whose trigger already happened but whose reward didn't land
 * (a crash right after the visit was completed, or the programme was off
 * then and is on now). A batch is the least-recently-checked rows first
 * (never checked, then oldest check; ties by sign-up), each stamped
 * lastCheckedAt — so rows that look due but don't qualify (e.g. only a visit
 * with the referrer) rotate to the back instead of filling every batch.
 */
export async function sweepDueReferrals({ batch = 50 }: { batch?: number } = {}): Promise<number> {
  const settings = await getReferralSettings();
  const order = [{ lastCheckedAt: { sort: "asc" as const, nulls: "first" as const } }, { createdAt: "asc" as const }, { id: "asc" as const }];
  const stamp = (rows: { id: string }[]) =>
    rows.length ? prisma.referral.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { lastCheckedAt: new Date() } }) : null;
  let paid = 0;
  if (settings.patient > 0) {
    const due = await prisma.referral.findMany({
      where: { status: "PENDING", inviteeRole: "PATIENT", invitee: { asPatient: { some: { status: "COMPLETED", paymentStatus: "PAID", amount: { gt: 0 } } } } },
      orderBy: order,
      select: { id: true, inviteeId: true },
      take: batch,
    });
    await stamp(due);
    for (const r of due) if ((await rewardPatientReferral(r.inviteeId)).outcome === "REWARDED") paid++;
  }
  if (settings.provider > 0) {
    const due = await prisma.referral.findMany({
      where: {
        status: "PENDING",
        OR: [
          { inviteeRole: "DOCTOR", invitee: { doctorProfile: { status: "APPROVED" } } },
          { inviteeRole: "NURSE", invitee: { nurseProfile: { status: "APPROVED" } } },
        ],
      },
      orderBy: order,
      select: { id: true, inviteeId: true },
      take: batch,
    });
    await stamp(due);
    for (const r of due) if ((await rewardProviderReferral(r.inviteeId)).outcome === "REWARDED") paid++;
  }
  return paid;
}

/** The invite card's numbers for one referrer. */
export async function referralSummary(userId: string, settings: ReferralSettings) {
  const monthStart = istStartOfMonth(istMonthKey(new Date()));
  const [grouped, earned, thisMonth] = await Promise.all([
    prisma.referral.groupBy({ by: ["status"], where: { referrerId: userId }, _count: { _all: true } }),
    prisma.referral.aggregate({ where: { referrerId: userId, status: "REWARDED" }, _sum: { rewardAmount: true } }),
    prisma.referral.count({ where: { referrerId: userId, status: "REWARDED", rewardedAt: { gte: monthStart } } }),
  ]);
  const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  return {
    joined: count("PENDING") + count("REWARDED") + count("REJECTED"),
    pending: count("PENDING"),
    rewarded: count("REWARDED"),
    earned: money(earned._sum.rewardAmount ?? 0),
    monthRewarded: thisMonth,
    monthlyCap: settings.monthlyCap,
  };
}
