import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthUser, revokeSessions, COOKIE_SECURE, IMPERSONATOR_COOKIE_NAME } from "@/lib/auth";

const COOKIE_NAME = "doconclick_token";

// POST: sign this account out of every device, this one included. Plain
// /api/auth/logout only clears this device's cookie.
export async function POST() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // An impersonating admin would be signing the *target* out everywhere.
  if ((await cookies()).get(IMPERSONATOR_COOKIE_NAME)?.value) {
    return NextResponse.json({ error: "Not available while impersonating." }, { status: 400 });
  }

  await revokeSessions(authUser.id);

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", maxAge: 0, path: "/" });
  return response;
}
