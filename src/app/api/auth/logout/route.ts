import { NextResponse } from "next/server";

const COOKIE_NAME = "doconclick_token";

export async function POST() {
  // Clear cookie directly on the response — required for Route Handlers in Next.js 15+
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
