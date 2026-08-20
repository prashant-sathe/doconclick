import { NextResponse } from "next/server";
import { getAuthUser, type JWTPayload } from "@/lib/auth";

// Shared by the admin report routes — returns the authenticated admin, or a
// 403 response to return immediately if the caller isn't one.
export async function requireAdmin(): Promise<
  { authUser: JWTPayload; denied: null } | { authUser: null; denied: NextResponse }
> {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return { authUser: null, denied: NextResponse.json({ error: "Not authorized" }, { status: 403 }) };
  }
  return { authUser, denied: null };
}

// A handful of legacy Appointment rows have NaN stored for amount/platformFee
// (bad data from an earlier bug, not schema-enforced since Postgres floats
// allow it) — without this, one such row turns an entire Prisma _sum/reduce
// into NaN, which then silently serializes to `null` over JSON.
export function safeNum(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Parses optional ?from=&to= ISO date query params into a Prisma-friendly range.
export function parseDateRange(searchParams: URLSearchParams): { gte?: Date; lte?: Date } {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}
