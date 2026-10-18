// Shared guards for API route handlers. Each returns either the value the
// route needs or a ready response to return as-is, so status codes stay
// consistent: 401 = no valid session (log in again), 403 = signed in but not
// allowed, 400 = a body that isn't JSON, 500 = our fault.

import { NextResponse } from "next/server";
import { getAuthUser, type JWTPayload } from "@/lib/auth";

/** The signed-in user if their role is one of `roles`; otherwise a 401 (no session) or 403 (wrong role). */
export async function requireRole(...roles: string[]): Promise<
  { authUser: JWTPayload; denied: null } | { authUser: null; denied: NextResponse }
> {
  const authUser = await getAuthUser();
  if (!authUser) {
    return { authUser: null, denied: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (!roles.includes(authUser.role)) {
    return { authUser: null, denied: NextResponse.json({ error: "Not authorized" }, { status: 403 }) };
  }
  return { authUser, denied: null };
}

/** The request's JSON object body, or a 400 when it's missing, malformed, or not an object. */
export async function readJson(req: Request): Promise<
  { body: Record<string, unknown>; invalid: null } | { body: null; invalid: NextResponse }
> {
  const body: unknown = await req.json().catch(() => undefined);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { body: null, invalid: NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 }) };
  }
  return { body: body as Record<string, unknown>, invalid: null };
}

/** Prisma's "record to update/delete not found". */
export function isRecordNotFound(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "P2025";
}
