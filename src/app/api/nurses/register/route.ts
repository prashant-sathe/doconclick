import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, sessionPayload, COOKIE_SECURE } from "@/lib/auth";
import { sendPushToAdmins } from "@/lib/firebaseAdmin";
import { validateRegistration } from "@/lib/validation";
import { withErrorLocale } from "@/lib/apiErrors";
import { createRateLimiter, clientIp } from "@/lib/rateLimit";
import { readReferralCookies, recordReferralSignup, REFERRAL_COOKIE } from "@/lib/referrals";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// Per IP, before any DB work or admin push — stops scripted signups.
const checkIpLimit = createRateLimiter(5, 10 * 60 * 1000);
const RATE_LIMITED = "Too many sign-up attempts. Please wait 10 minutes and try again.";

// POST: Register a nurse (PENDING until an admin approves). Signs them in so
// they can complete their profile, documents and services at /nurse/profile.
export const POST = withErrorLocale(async function POST(req: Request) {
  if (!checkIpLimit(clientIp(req))) {
    return NextResponse.json({ error: RATE_LIMITED }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));

  const result = validateRegistration(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { name, mobile, email, password } = result.data;

  try {
    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (existing) {
      return NextResponse.json({ error: "This mobile number is already registered. Try signing in instead." }, { status: 409 });
    }
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return NextResponse.json({ error: "This email is already registered. Try signing in instead." }, { status: 409 });
      }
    }

    const hashed = await hashPassword(password);

    // No `include` — the response only needs id/name/role, and reading the
    // freshly-created profile back adds a failure surface for no benefit.
    const user = await prisma.user.create({
      data: {
        name,
        mobile,
        email,
        password: hashed,
        role: "NURSE",
        nurseProfile: {
          create: { status: "PENDING" },
        },
      },
    });

    // Came through someone's invite link? Rewarded on approval (src/lib/referrals.ts).
    await recordReferralSignup(user, await readReferralCookies());

    void sendPushToAdmins({
      key: "adminNurseRegistered",
      values: { name },
      url: "/admin/nurses",
    });

    const payload = sessionPayload(user);
    const token = signToken(payload);

    const response = NextResponse.json({ id: user.id, name: user.name, role: user.role });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    response.cookies.set(REFERRAL_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
      const field = Array.isArray(target) ? target.join(",") : String(target ?? "");
      const what = field.includes("email") ? "email" : field.includes("mobile") ? "mobile number" : "account";
      return NextResponse.json({ error: `This ${what} is already registered. Try signing in instead.` }, { status: 409 });
    }
    console.error("Nurse registration failed:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
});
