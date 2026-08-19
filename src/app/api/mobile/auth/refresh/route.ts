import { NextResponse } from "next/server";
import { getAuthUserFromBearer, signToken } from "@/lib/auth";

// Re-signs a still-valid bearer token with a fresh 7-day expiry, so the
// Flutter app can silently extend a session instead of forcing re-login.
export async function POST(req: Request) {
  const user = getAuthUserFromBearer(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const token = signToken(user);
  return NextResponse.json({ token, user });
}
