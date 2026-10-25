// Complaint tickets (FP1-17) — the rules the admin panel, the filer's thread
// view and the API routes share. Pure (no server imports), so client pages can
// use the constants and the SLA maths too.

export const COMPLAINT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export const COMPLAINT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

export const isComplaintStatus = (s: unknown): s is ComplaintStatus =>
  typeof s === "string" && (COMPLAINT_STATUSES as readonly string[]).includes(s);
export const isComplaintPriority = (s: unknown): s is ComplaintPriority =>
  typeof s === "string" && (COMPLAINT_PRIORITIES as readonly string[]).includes(s);

/** Who may file and follow tickets (doctors file via the Support Assistant). */
export const COMPLAINT_FILER_ROLES = ["PATIENT", "NURSE", "DOCTOR"] as const;

export const COMPLAINT_SUBJECT_MAX = 200;
export const COMPLAINT_DESCRIPTION_MAX = 4000;
export const COMPLAINT_MESSAGE_MAX = 4000;
/** Replies a filer may add to one ticket — past this, raise a new one. */
export const COMPLAINT_MAX_USER_MESSAGES = 100;

/** Hours support has to send the first public reply, by priority. */
export const FIRST_RESPONSE_SLA_HOURS: Record<ComplaintPriority, number> = {
  URGENT: 4,
  HIGH: 24,
  NORMAL: 48,
  LOW: 72,
};

const HOUR = 60 * 60 * 1000;

/**
 * Plain text for a ticket field: no control or bidi-override characters
 * (newlines and tabs kept; ZWJ/ZWNJ too — Devanagari and emoji need them),
 * Windows line endings folded, at most one blank line in a row, trimmed and
 * capped at `max`. Rendering is always as text, never HTML.
 */
export function cleanComplaintText(raw: unknown, max: number): string {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export type SlaState = {
  /** When the first reply is (or was) due. */
  dueAt: Date;
  /** Due and still unanswered, or answered late. */
  breached: boolean;
  /** Still waiting for the first reply. */
  awaitingFirstResponse: boolean;
};

export function complaintSla(
  c: { status: string; priority: string; createdAt: Date | string; firstResponseAt: Date | string | null },
  now: Date = new Date(),
): SlaState {
  const hours = FIRST_RESPONSE_SLA_HOURS[isComplaintPriority(c.priority) ? c.priority : "NORMAL"];
  const dueAt = new Date(new Date(c.createdAt).getTime() + hours * HOUR);
  const responded = c.firstResponseAt ? new Date(c.firstResponseAt) : null;
  if (responded) return { dueAt, breached: responded > dueAt, awaitingFirstResponse: false };
  // A ticket resolved without a written reply doesn't keep ageing into a breach.
  if (c.status === "RESOLVED") return { dueAt, breached: false, awaitingFirstResponse: false };
  return { dueAt, breached: now > dueAt, awaitingFirstResponse: true };
}

/** Prisma `where` for unanswered tickets past their first-response SLA. */
export function slaBreachedWhere(now: Date = new Date()) {
  return {
    status: { not: "RESOLVED" },
    firstResponseAt: null,
    OR: COMPLAINT_PRIORITIES.map((priority) => ({
      priority,
      createdAt: { lt: new Date(now.getTime() - FIRST_RESPONSE_SLA_HOURS[priority] * HOUR) },
    })),
  };
}

/** The filer's ticket list page, by their role; a ticket's thread is `${base}/${id}`. */
export function complaintListHref(role: string): string {
  if (role === "NURSE") return "/nurse/support";
  if (role === "DOCTOR") return "/doctor/support/tickets";
  return "/patient/support";
}

/** What the filer may see of their own ticket — never priority, assignee or notes. */
export const PUBLIC_COMPLAINT_SELECT = {
  id: true,
  subject: true,
  description: true,
  status: true,
  appointmentId: true,
  contactMobile: true,
  lastActivityAt: true,
  resolvedAt: true,
  createdAt: true,
} as const;
