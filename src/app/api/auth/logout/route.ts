import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_SECURE, IMPERSONATOR_COOKIE_NAME, verifyToken } from "@/lib/auth";
import { endImpersonation } from "@/lib/impersonation";
import { withErrorLocale } from "@/lib/apiErrors";

const COOKIE_NAME = "doconclick_token";

export const POST = withErrorLocale(async function POST() {
  // Logging out while impersonating ends the impersonation — close its audit
  // log row too. verifyToken (signature + expiry), not verifySession: even an
  // admin revoked meanwhile still had a session that has now ended.
  const impersonator = (await cookies()).get(IMPERSONATOR_COOKIE_NAME)?.value;
  const admin = impersonator ? verifyToken(impersonator) : null;
  if (admin) await endImpersonation(admin.id).catch((err) => console.error("Could not close impersonation log", err));

  // Clear cookies directly on the response — required for Route Handlers in Next.js 15+
  const response = NextResponse.json({ success: true });
  const clearOpts = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
  response.cookies.set(COOKIE_NAME, "", clearOpts);
  // Also clear any stashed impersonator session — logging out fully ends
  // impersonation too, rather than leaving it to resurface on the next login.
  response.cookies.set(IMPERSONATOR_COOKIE_NAME, "", clearOpts);
  return response;
});
