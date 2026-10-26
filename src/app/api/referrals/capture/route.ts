import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorLocale } from "@/lib/apiErrors";
import { createRateLimiter, clientIp } from "@/lib/rateLimit";
import {
  normalizeReferralCode, getReferralSettings, referralProgramOn, readReferralCookies, newDeviceId,
  REFERRAL_COOKIE, DEVICE_COOKIE, referralCookieOptions, deviceCookieOptions,
} from "@/lib/referrals";

// Per IP — guessing codes isn't worth much (they're shared openly), but
// there's no reason to answer it fast.
const checkIpLimit = createRateLimiter(30, 10 * 60 * 1000);

// POST { code } — public; called by the register pages when the URL has
// ?ref= (web link or a native deep link routed there). Keeps the code in an
// httpOnly cookie for whichever sign-up follows (form or Google), plus a
// device cookie the abuse guards compare (src/lib/referrals.ts). Nothing is
// stored in the database until an account is actually created.
export const POST = withErrorLocale(async function POST(req: Request) {
  if (!checkIpLimit(clientIp(req))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const code = normalizeReferralCode(body && typeof body === "object" ? (body as { code?: unknown }).code : null);
  if (!code) return NextResponse.json({ ok: false });

  const [settings, owner] = await Promise.all([
    getReferralSettings(),
    prisma.referralCode.findUnique({ where: { code }, select: { user: { select: { deletedAt: true } } } }),
  ]);
  if (!referralProgramOn(settings) || !owner || owner.user.deletedAt) return NextResponse.json({ ok: false });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(REFERRAL_COOKIE, code, referralCookieOptions);
  if (!(await readReferralCookies()).deviceId) response.cookies.set(DEVICE_COOKIE, newDeviceId(), deviceCookieOptions);
  return response;
});
