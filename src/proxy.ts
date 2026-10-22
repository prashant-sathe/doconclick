import { NextRequest, NextResponse } from "next/server";
import { verifySession, verifyToken, type JWTPayload } from "@/lib/auth";
import { ROLE_HOME, safeNext } from "@/lib/roleHome";

const COOKIE_NAME = "doconclick_token";

// Pages inside a role's area that anyone may open, signed in or not. A
// doctor's public profile is shared (QR codes, links, the sitemap) — booking
// from it asks for a patient login on its own.
const PUBLIC: RegExp[] = [
  /^\/patient\/doctor\/[^/]+\/?$/,
];

// Routes that require authentication, mapped to allowed roles. First match
// wins, so the narrower DOCTOR+STAFF pages come before the rest of /doctor.
// Every page under /patient, /doctor and /nurse is covered (their /register
// pages are let through before this check), so none renders its shell for a
// signed-out visitor before the page's own redirect kicks in.
const PROTECTED: { pattern: RegExp; roles: string[] }[] = [
  { pattern: /^\/admin(\/|$)/, roles: ["ADMIN"] },
  // A receptionist (STAFF) works the doctor's queue, books walk-ins and
  // chats with patients.
  { pattern: /^\/doctor\/(dashboard|chat|walk-in)(\/|$)/, roles: ["DOCTOR", "STAFF"] },
  { pattern: /^\/doctor(\/|$)/, roles: ["DOCTOR"] },
  { pattern: /^\/patient(\/|$)/, roles: ["PATIENT"] },
  { pattern: /^\/nurse(\/|$)/, roles: ["NURSE"] },
];

// Next.js 16 requires export name "proxy" (renamed from "middleware")
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes, static files, and public pages — but not "/login",
  // which still needs the token check below so an already-authenticated
  // visitor gets redirected to their dashboard instead of seeing the form.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/" ||
    pathname === "/patient/register" ||
    pathname === "/doctor/register" ||
    pathname === "/nurse/register"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  let user: JWTPayload | null = null;
  if (token) {
    try {
      // Revoked/deleted sessions go to /login rather than an empty page shell.
      user = await verifySession(token);
    } catch {
      // DB unreachable: fall back to the signature check for page routing
      // only — every API route still enforces the full session check.
      user = verifyToken(token);
    }
  }

  // Already logged in and visiting /login → send them on to ?next= (e.g. a
  // doctor's booking page from a QR scan), else to their home. A wrong-role
  // `next` is bounced again by the PROTECTED check on that request.
  if (pathname === "/login" && user) {
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(
      new URL(next ?? ROLE_HOME[user.role] ?? "/", request.url)
    );
  }

  // Google sign-in accounts start with a placeholder mobile number — force
  // them to add a real one before touching any other authenticated page.
  if (user && user.mobile.startsWith("pending_") && pathname !== "/complete-profile") {
    return NextResponse.redirect(new URL("/complete-profile", request.url));
  }

  // Check if this route requires authentication
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();
  const matched = PROTECTED.find((p) => p.pattern.test(pathname));
  if (!matched) return NextResponse.next();

  // Not authenticated → redirect to /login with the original URL as ?next=
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Wrong role → redirect to their correct home
  if (!matched.roles.includes(user.role)) {
    return NextResponse.redirect(
      new URL(ROLE_HOME[user.role] ?? "/", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
