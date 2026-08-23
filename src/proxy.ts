import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const COOKIE_NAME = "doconclick_token";

// Routes that require authentication, mapped to allowed roles
const PROTECTED: { pattern: RegExp; roles: string[] }[] = [
  { pattern: /^\/admin(\/|$)/, roles: ["ADMIN"] },
  { pattern: /^\/doctor\/dashboard(\/|$)/, roles: ["DOCTOR"] },
  { pattern: /^\/patient\/dashboard(\/|$)/, roles: ["PATIENT"] },
  { pattern: /^\/patient\/book(\/|$)/, roles: ["PATIENT"] },
  { pattern: /^\/patient\/assistant(\/|$)/, roles: ["PATIENT"] },
  { pattern: /^\/patient\/payment(\/|$)/, roles: ["PATIENT"] },
  { pattern: /^\/patient\/wallet(\/|$)/, roles: ["PATIENT"] },
];

// Redirect destinations after login by role
const ROLE_HOME: Record<string, string> = {
  ADMIN:   "/admin",
  DOCTOR:  "/doctor/dashboard",
  PATIENT: "/patient/dashboard",
};

// Next.js 16 requires export name "proxy" (renamed from "middleware")
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes, static files, auth pages, and public pages
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/login" ||
    pathname === "/" ||
    pathname === "/patient/register" ||
    pathname === "/doctor/register"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const user = token ? verifyToken(token) : null;

  // Already logged in and visiting /login → redirect to their home
  if (pathname === "/login" && user) {
    return NextResponse.redirect(
      new URL(ROLE_HOME[user.role] ?? "/", request.url)
    );
  }

  // Google sign-in accounts start with a placeholder mobile number — force
  // them to add a real one before touching any other authenticated page.
  if (user && user.mobile.startsWith("pending_") && pathname !== "/complete-profile") {
    return NextResponse.redirect(new URL("/complete-profile", request.url));
  }

  // Check if this route requires authentication
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
