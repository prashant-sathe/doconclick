import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/routeGuards";
import { withErrorLocale } from "@/lib/apiErrors";
import {
  getReferralSettings, ensureReferralCode, referralLinks, referralSummary,
  readReferralCookies, newDeviceId, DEVICE_COOKIE, deviceCookieOptions, REFERRAL_ROLES,
} from "@/lib/referrals";

// GET — the "Invite & earn" card (patient / doctor / nurse profile): the
// caller's code and share links, the reward amounts, and how their invites
// are doing. `enabled: false` (that side's reward is ₹0) hides the card; no
// code is made then. Opening it remembers this device as the referrer's own, so an
// account they create from it doesn't count (src/lib/referrals.ts).
export const GET = withErrorLocale(async function GET() {
  const { authUser, denied } = await requireRole(...REFERRAL_ROLES);
  if (denied) return denied;

  // A patient invites patients; a doctor or nurse invites doctors and nurses.
  const settings = await getReferralSettings();
  const isPatient = authUser.role === "PATIENT";
  const amount = isPatient ? settings.patient : settings.provider;
  if (amount <= 0) return NextResponse.json({ enabled: false });

  const cookieDevice = (await readReferralCookies()).deviceId;
  const deviceId = cookieDevice ?? newDeviceId();
  const code = await ensureReferralCode(authUser.id, deviceId);
  const [summary, wallet] = await Promise.all([
    referralSummary(authUser.id, settings),
    prisma.wallet.findUnique({ where: { userId: authUser.id }, select: { balance: true } }),
  ]);
  const links = referralLinks(code);

  const response = NextResponse.json({
    enabled: true,
    code,
    amount,
    links: isPatient ? { patient: links.patient } : { doctor: links.doctor, nurse: links.nurse },
    ...summary,
    walletBalance: wallet?.balance ?? 0,
  });
  if (!cookieDevice) response.cookies.set(DEVICE_COOKIE, deviceId, deviceCookieOptions);
  return response;
});
