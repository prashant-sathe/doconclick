// Who may read a patient's medical history (doctor's patient-history page,
// vitals): a doctor or nurse with a real visit with that exact person — the
// account holder, or one specific family member, never mixed. A booking only
// counts once the provider accepted it (SCHEDULED) or held it (COMPLETED); a
// pending, declined, expired or cancelled request grants nothing. A walk-in
// the provider's own desk booked (bookedById set) has no patient consent
// behind it, so it never counts — not even COMPLETED, since the doctor can
// mark it complete with no proof the patient was there (#83). Only the
// patient's own booking opens their history — the same rule as the front
// desk's lookup (src/lib/knownPatient.ts).
//
// A confirmed visit that's still ahead keeps access open while the provider
// prepares; once every shared visit is completed, access lasts
// CARE_ACCESS_WINDOW_DAYS after the latest one. Visits are timed by
// scheduledAt — no completion timestamp is stored.

import { prisma } from "@/lib/prisma";

export const CARE_ACCESS_WINDOW_DAYS = 90;
const WINDOW_MS = CARE_ACCESS_WINDOW_DAYS * 24 * 60 * 60_000;

type Visit = { status: string; scheduledAt: Date; bookedById?: string | null };

/** Whether one visit counts: the patient's own booking, accepted or held. */
const isRealVisit = (v: Visit) => !v.bookedById && (v.status === "SCHEDULED" || v.status === "COMPLETED");

/** The rule itself, over one provider's visits with one person (any statuses). */
export function hasCareAccess(visits: Visit[], now: Date = new Date()): boolean {
  const real = visits.filter(isRealVisit);
  if (real.some((v) => v.status === "SCHEDULED")) return true;
  const last = Math.max(...real.map((v) => v.scheduledAt.getTime()));
  return real.length > 0 && now.getTime() <= last + WINDOW_MS;
}

/** A user-facing reason `providerId` can't see this person's history, or null. */
export async function careAccessProblem(params: {
  providerId: string;
  patientId: string;
  dependentId: string | null;
  now?: Date;
}): Promise<string | null> {
  const { providerId, patientId, dependentId, now = new Date() } = params;
  const visits = await prisma.appointment.findMany({
    where: { doctorId: providerId, patientId, dependentId, status: { in: ["SCHEDULED", "COMPLETED"] } },
    select: { status: true, scheduledAt: true, bookedById: true },
    orderBy: { scheduledAt: "desc" },
  });
  if (hasCareAccess(visits, now)) return null;
  const real = visits.filter(isRealVisit);
  if (real.length === 0 && visits.length > 0) {
    return "For a walk-in you booked, the patient's history opens only once they book a visit with you themselves.";
  }
  if (real.length === 0) {
    return "You can see this patient's history only after you've accepted a visit with them.";
  }
  const last = real[0].scheduledAt;
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
  if (visits.some((v) => v.bookedById)) {
    return `Access to this patient's history ended ${CARE_ACCESS_WINDOW_DAYS} days after your last visit (${fmt(last)}). The walk-in you booked doesn't reopen it; it reopens only when they book with you themselves and you accept.`;
  }
  return `Access to this patient's history ended ${CARE_ACCESS_WINDOW_DAYS} days after your last visit (${fmt(last)}). It reopens if they book with you again and you accept.`;
}
