import { NextResponse } from "next/server";
import { requireRole } from "@/lib/routeGuards";
import { isValidYmd, istStartOfDay, istEndOfDay } from "@/lib/istDate";

// Shared by the admin routes — returns the authenticated admin, or a 401 (no
// session) / 403 (not an admin) response to return immediately.
export function requireAdmin() {
  return requireRole("ADMIN");
}

// A handful of legacy Appointment rows have NaN stored for amount/platformFee
// (bad data from an earlier bug, not schema-enforced since Postgres floats
// allow it) — without this, one such row turns an entire Prisma _sum/reduce
// into NaN, which then silently serializes to `null` over JSON.
export function safeNum(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Parses optional ?from=&to= (YYYY-MM-DD, inclusive) into a Prisma-friendly
 * range covering whole IST days (src/lib/istDate.ts). A value that isn't a
 * real date, or a `from` after `to`, is a ready-made 400 for the route to
 * return — never a 500 from `new Date("garbage")` reaching the database.
 */
export function parseDateRange(
  searchParams: URLSearchParams,
): { range: { gte?: Date; lte?: Date }; response: null } | { range: null; response: NextResponse } {
  const bad = (error: string) => ({ range: null, response: NextResponse.json({ error }, { status: 400 }) });
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  if (from && !isValidYmd(from)) return bad("Invalid 'from' date — use YYYY-MM-DD.");
  if (to && !isValidYmd(to)) return bad("Invalid 'to' date — use YYYY-MM-DD.");
  if (from && to && from > to) return bad("'From' can't be after 'To'.");
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = istStartOfDay(from);
  if (to) range.lte = istEndOfDay(to);
  return { range, response: null };
}
