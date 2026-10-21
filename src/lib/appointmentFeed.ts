import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getChatFollowUpDays } from "@/lib/chatAccess";

// Views of /api/appointments/me (BUG-TRACKER #55):
//   ?view=active   — what the 5s poll needs: every live booking (pending,
//                    scheduled) plus anything from the last RECENT_DAYS (or
//                    the chat follow-up window, if longer — so every open
//                    chat's unread count is in it), so a visit that just
//                    completed/was cancelled still shows (and toasts) — an
//                    array, bounded however long the history is.
//   ?view=history  — finished bookings, newest first, a page at a time:
//                    { items, nextCursor, counts }. &limit= (1–50, default
//                    20), &cursor= (the last page's nextCursor), &status=
//                    COMPLETED,CANCELLED… to narrow it.
//   (no view)      — everything, as before (earnings pages). Not for polling.

export const LIVE_STATUSES = ["PENDING_APPROVAL", "SCHEDULED"];
export const FINISHED_STATUSES = ["COMPLETED", "CANCELLED", "REJECTED", "EXPIRED", "NO_SHOW"];
export const RECENT_DAYS = 7;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type FeedView =
  | { kind: "all" }
  | { kind: "active"; recentDays: number }
  | { kind: "history"; limit: number; cursor: string | null; statuses: string[] };

export async function parseFeedView(url: string): Promise<{ view: FeedView } | { response: NextResponse }> {
  const p = new URL(url).searchParams;
  const kind = p.get("view");
  if (!kind) return { view: { kind: "all" } };
  if (kind === "active") return { view: { kind: "active", recentDays: Math.max(RECENT_DAYS, await getChatFollowUpDays()) } };
  if (kind !== "history") {
    return { response: NextResponse.json({ error: "view must be 'active' or 'history'" }, { status: 400 }) };
  }
  const limitRaw = p.get("limit");
  const limit = limitRaw === null ? DEFAULT_LIMIT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { response: NextResponse.json({ error: `limit must be a whole number from 1 to ${MAX_LIMIT}` }, { status: 400 }) };
  }
  const statuses = p.get("status")?.split(",").map((s) => s.trim()).filter(Boolean) ?? FINISHED_STATUSES;
  if (statuses.length === 0 || statuses.some((s) => !FINISHED_STATUSES.includes(s))) {
    return { response: NextResponse.json({ error: `status must be one or more of ${FINISHED_STATUSES.join(", ")}` }, { status: 400 }) };
  }
  return { view: { kind: "history", limit, cursor: p.get("cursor") || null, statuses } };
}

/** The view's filter, ANDed with the caller's ownership filter. */
export function feedWhere(owner: Prisma.AppointmentWhereInput, view: FeedView): Prisma.AppointmentWhereInput {
  if (view.kind === "all") return owner;
  if (view.kind === "history") return { AND: [owner, { status: { in: view.statuses } }] };
  const since = new Date(Date.now() - view.recentDays * 24 * 60 * 60 * 1000);
  return {
    AND: [owner, { OR: [{ status: { in: LIVE_STATUSES } }, { scheduledAt: { gte: since } }, { completedAt: { gte: since } }] }],
  };
}

/** Order + paging args: history is newest first with an id tiebreak (so the
 *  cursor is stable); the other views keep the role's own order. */
export function feedPaging(view: FeedView, order: Prisma.AppointmentOrderByWithRelationInput[]) {
  if (view.kind !== "history") return { orderBy: order };
  return {
    orderBy: [{ scheduledAt: "desc" }, { id: "desc" }] as Prisma.AppointmentOrderByWithRelationInput[],
    take: view.limit + 1, // one extra, to know whether there's another page
    ...(view.cursor ? { cursor: { id: view.cursor }, skip: 1 } : {}),
  };
}

/** A cursor that isn't one of the caller's finished bookings → 400 (Prisma
 *  would otherwise quietly return an empty page). */
export async function badCursor(owner: Prisma.AppointmentWhereInput, view: FeedView): Promise<NextResponse | null> {
  if (view.kind !== "history" || !view.cursor) return null;
  const ok = await prisma.appointment.count({ where: { AND: [owner, { id: view.cursor, status: { in: view.statuses } }] } });
  return ok ? null : NextResponse.json({ error: "Unknown cursor — reload the list." }, { status: 400 });
}

/** The response body for the view. `rows` are already mapped for the client. */
export async function feedResponse<T extends { id: string }>(owner: Prisma.AppointmentWhereInput, view: FeedView, rows: T[]) {
  if (view.kind !== "history") return NextResponse.json(rows);
  const more = rows.length > view.limit;
  const items = more ? rows.slice(0, view.limit) : rows;
  // Whole-history totals per finished status ("Total consultations", "Load N more").
  const grouped = await prisma.appointment.groupBy({
    by: ["status"],
    where: { AND: [owner, { status: { in: FINISHED_STATUSES } }] },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(FINISHED_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]));
  return NextResponse.json({ items, nextCursor: more ? items[items.length - 1].id : null, counts });
}
