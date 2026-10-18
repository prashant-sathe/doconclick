// Ordering and "is this visit over?" rules for the doctor dashboard queue.

type QueueAppt = { status: string; scheduledAt: string | Date };

// A SCHEDULED visit this long past its time is treated as over but not
// closed: it drops out of "Next" and the dashboard asks for it to be marked
// complete or no-show. The grace keeps a visit that's running late from
// being flagged the moment its start time passes.
export const OVERDUE_GRACE_MS = 60 * 60 * 1000;

const time = (a: QueueAppt) => new Date(a.scheduledAt).getTime();

export function isOverdue(a: QueueAppt, now: number): boolean {
  return a.status === "SCHEDULED" && time(a) < now - OVERDUE_GRACE_MS;
}

export const byVisitAsc = (a: QueueAppt, b: QueueAppt) => time(a) - time(b);
export const byVisitDesc = (a: QueueAppt, b: QueueAppt) => time(b) - time(a);

// The soonest scheduled visit that isn't already over — never a stale one.
export function nextUpcoming<T extends QueueAppt>(appts: T[], now: number): T | undefined {
  return appts.filter((a) => a.status === "SCHEDULED" && !isOverdue(a, now)).sort(byVisitAsc)[0];
}
