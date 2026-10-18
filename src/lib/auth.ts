import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "doconclick_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// Read on first use rather than at import, so `next build` (which imports
// route modules) works without the secret. There is deliberately no
// fallback: a missing secret must fail loudly, not sign with a known key.
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

// Short-lived proof that this browser just re-verified via Google in the
// forgot-password flow — the only way to set a password without the current one.
export const PWRESET_COOKIE_NAME = "doconclick_pwreset";
export const PWRESET_MAX_AGE = 15 * 60; // 15 minutes in seconds

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
  // User.tokenVersion at sign-in. Tokens issued before this claim existed
  // have none and count as version 0.
  tv?: number;
};

// The one way to build a session payload from a User row, so every sign-in
// path carries the current tokenVersion.
export function sessionPayload(user: { id: string; name: string; role: string; mobile: string; tokenVersion: number }): JWTPayload {
  return { id: user.id, name: user.name, role: user.role, mobile: user.mobile, tv: user.tokenVersion };
}

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
  // Copy the known fields only — a payload that came out of verifyToken also
  // carries iat/exp, which jwt.sign rejects alongside expiresIn.
  const { id, name, role, mobile, tv } = payload;
  return jwt.sign({ id, name, role, mobile, tv }, jwtSecret(), { expiresIn });
}

// Signature + expiry only. Use verifySession() to also honour revocation.
export function verifyToken(token: string): JWTPayload | null {
  const secret = jwtSecret();
  try {
    const decoded = jwt.verify(token, secret) as JWTPayload & { purpose?: string };
    // A password-reset token is not a session.
    return decoded.purpose ? null : decoded;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// Session revocation
// ──────────────────────────────────────────────────────────────
// Every authenticated request checks the token's `tv` against
// User.tokenVersion (and deletedAt). A short in-process cache keeps that to
// about one lookup per user per 30s; revokeSessions() evicts it, so a
// revocation is immediate in this process. The cache lives on globalThis so
// proxy.ts and route handlers share it rather than each holding a stale copy.
const SESSION_CACHE_TTL_MS = 30_000;
type SessionState = { tokenVersion: number; active: boolean; at: number };
const globalForSessions = globalThis as unknown as { sessionCache?: Map<string, SessionState> };
const sessionCache = (globalForSessions.sessionCache ??= new Map<string, SessionState>());

async function sessionState(userId: string): Promise<SessionState> {
  const cached = sessionCache.get(userId);
  if (cached && Date.now() - cached.at < SESSION_CACHE_TTL_MS) return cached;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true, deletedAt: true } });
  const state = { tokenVersion: user?.tokenVersion ?? 0, active: !!user && !user.deletedAt, at: Date.now() };
  sessionCache.set(userId, state);
  return state;
}

// verifyToken plus: the account still exists, isn't deleted, and its
// sessions haven't been revoked since this token was issued. DB errors
// propagate (a 500), rather than masquerading as "logged out".
export async function verifySession(token: string): Promise<JWTPayload | null> {
  const payload = verifyToken(token);
  if (!payload) return null;
  const state = await sessionState(payload.id);
  if (!state.active || (payload.tv ?? 0) !== state.tokenVersion) return null;
  return payload;
}

// Invalidates every existing session for the user. Returns the new
// tokenVersion so a caller that should stay signed in (e.g. the device that
// just changed the password) can re-issue its own cookie.
export async function revokeSessions(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  sessionCache.delete(userId);
  return user.tokenVersion;
}

// ──────────────────────────────────────────────────────────────
// Password-reset proof (forgot-password via Google)
// ──────────────────────────────────────────────────────────────
export function signPasswordResetToken(user: { id: string; tokenVersion: number }): string {
  return jwt.sign({ id: user.id, tv: user.tokenVersion, purpose: "pwreset" }, jwtSecret(), { expiresIn: PWRESET_MAX_AGE });
}

// Valid only for this user and only until their sessions are next revoked —
// which setting the password does, so each proof works once.
export async function verifyPasswordResetToken(token: string, userId: string): Promise<boolean> {
  try {
    const decoded = jwt.verify(token, jwtSecret()) as { id?: string; tv?: number; purpose?: string };
    if (decoded.purpose !== "pwreset" || decoded.id !== userId) return false;
    const state = await sessionState(userId);
    return state.active && decoded.tv === state.tokenVersion;
  } catch {
    return false;
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

export const PWRESET_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "lax" as const,
  maxAge: PWRESET_MAX_AGE,
  path: "/",
};

export async function setPasswordResetCookie(payload: JWTPayload) {
  const cookieStore = await cookies();
  cookieStore.set(PWRESET_COOKIE_NAME, signPasswordResetToken({ id: payload.id, tokenVersion: payload.tv ?? 0 }), PWRESET_COOKIE_OPTIONS);
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
  return verifySession(token);
}
