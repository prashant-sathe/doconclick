import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET ?? "doconclick_super_secret_jwt_key_change_in_prod";
const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// Stashes the admin's own token while they're impersonating another account,
// so an "exit impersonation" action can restore it without re-authenticating.
export const IMPERSONATOR_COOKIE_NAME = "doconclick_impersonator_token";

// Browsers drop `Secure` cookies on plain HTTP origins, so a NODE_ENV=production
// deployment served without TLS (e.g. straight to an EC2 IP) needs to opt out
// via COOKIE_SECURE=false until a domain + HTTPS are in place.
export const COOKIE_SECURE =
  process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";

export type JWTPayload = {
  id: string;
  name: string;
  role: string;
  mobile: string;
};

// ──────────────────────────────────────────────────────────────
// Password helpers
// ──────────────────────────────────────────────────────────────
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ──────────────────────────────────────────────────────────────
// JWT helpers
// ──────────────────────────────────────────────────────────────
export function signToken(payload: JWTPayload, expiresIn: jwt.SignOptions["expiresIn"] = "7d"): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// Cookie helpers (server-side)
// ──────────────────────────────────────────────────────────────
export async function setAuthCookie(payload: JWTPayload) {
  const token = signToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export async function getAuthUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// ──────────────────────────────────────────────────────────────
// Read token from raw request headers (for middleware)
// ──────────────────────────────────────────────────────────────
export function getTokenFromRequest(request: Request): JWTPayload | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifyToken(decodeURIComponent(match[1]));
}
