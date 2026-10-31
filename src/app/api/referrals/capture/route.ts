import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorLocale } from "@/lib/apiErrors";
import { createRateLimiter, clientIp } from "@/lib/rateLimit";
import {
  normalizeReferralCode, getReferralSettings, referralProgramOn, readReferralCookies, newDeviceId, rewardFor,
  REFERRAL_COOKIE, DEVICE_COOKIE, REFERRAL_ROLES, referralCookieOptions, deviceCookieOptions,
} from "@/lib/referrals";

// Per IP — guessing codes isn't worth much (they're shared openly), but
// there's no reason to answer it fast.
const checkIpLimit = createRateLimiter(30, 10 * 60 * 1000);

// GET ?role=PATIENT|DOCTOR|NURSE — public; the register page's optional
// "Referral code" field. `enabled` is whether a sign-up of that role can
// count as an invitee right now (its reward isn't ₹0 — otherwise the field
// is hidden), `code` the one already kept from an earlier invite link.
export const GET = withErrorLocale(async function GET(req: Request) {
  const role = new URL(req.url).searchParams.get("role") ?? "";
  if (!(REFERRAL_ROLES as readonly string[]).includes(role)) return NextResponse.json({ enabled: false, code: null });
  const enabled = rewardFor(await getReferralSettings(), role) > 0;
  return NextResponse.json({ enabled, code: enabled ? (await readReferralCookies()).code : null });
});

// POST { code } — public; called by the register pages for an invite link's
// ?ref= (web link or a native deep link routed there) or a code typed into
// the field. Keeps the code in an httpOnly cookie for whichever sign-up
// follows (form or Google), plus a device cookie the abuse guards compare
// (src/lib/referrals.ts). Nothing is stored in the database until an account
// is actually created. `reason`: INVALID (no such code) or OFF (programme off).
export const POST = withErrorLocale(async function POST(req: Request) {
  if (!checkIpLimit(clientIp(req))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const code = normalizeReferralCode(body && typeof body === "object" ? (body as { code?: unknown }).code : null);
  if (!code) return NextResponse.json({ ok: false, reason: "INVALID" });

  const [settings, owner] = await Promise.all([
    getReferralSettings(),
    prisma.referralCode.findUnique({ where: { code }, select: { user: { select: { deletedAt: true } } } }),
  ]);
  if (!referralProgramOn(settings)) return NextResponse.json({ ok: false, reason: "OFF" });
  if (!owner || owner.user.deletedAt) return NextResponse.json({ ok: false, reason: "INVALID" });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(REFERRAL_COOKIE, code, referralCookieOptions);
  if (!(await readReferralCookies()).deviceId) response.cookies.set(DEVICE_COOKIE, newDeviceId(), deviceCookieOptions);
  return response;
});

// DELETE — the visitor cleared the field: the sign-up that follows isn't
// anyone's invitee, even if an invite link was opened earlier.
export const DELETE = withErrorLocale(async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(REFERRAL_COOKIE, "", { ...referralCookieOptions, maxAge: 0 });
  return response;
});
