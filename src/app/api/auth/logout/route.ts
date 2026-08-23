import { NextResponse } from "next/server";
import { COOKIE_SECURE, IMPERSONATOR_COOKIE_NAME } from "@/lib/auth";

const COOKIE_NAME = "doconclick_token";

export async function POST() {
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
}
