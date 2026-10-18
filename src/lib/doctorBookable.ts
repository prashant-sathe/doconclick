import type { Prisma } from "@/generated/prisma/client";
import { hasActiveDoctorSubscription } from "@/lib/subscription";

// A doctor patients can book: approved, verified, not deleted, and on an
// active free trial or paid monthly plan (otherwise their dashboard is locked
// and nobody would ever see the request). One rule for the listing, the
// public profile, matching, and every write path that books a doctor, so a
// doctor hidden from search can't still be booked via the API.

export const UNBOOKABLE_MESSAGE = "This doctor isn't taking bookings right now.";

// For queries that list bookable doctors. Extra profile filters (e.g.
// specialty) go in `profile`; the bookable rules always win over them.
export function bookableDoctorWhere(profile: Prisma.DoctorProfileWhereInput = {}): Prisma.UserWhereInput {
  const now = new Date();
  return {
    role: "DOCTOR",
    deletedAt: null,
    doctorProfile: {
      ...profile,
      status: "APPROVED",
      isVerified: true,
      OR: [{ trialEndsAt: { gt: now } }, { subscriptionPaidUntil: { gt: now } }],
    },
  };
}

// The same rule for a user row already loaded with its doctorProfile.
export function isDoctorBookable(
  user: {
    role: string;
    deletedAt: Date | null;
    doctorProfile: {
      status: string;
      isVerified: boolean;
      trialEndsAt: Date | null;
      subscriptionPaidUntil: Date | null;
    } | null;
  } | null
): boolean {
  return !!user
    && user.role === "DOCTOR"
    && !user.deletedAt
    && !!user.doctorProfile
    && user.doctorProfile.status === "APPROVED"
    && user.doctorProfile.isVerified
    && hasActiveDoctorSubscription(user.doctorProfile);
}

// Select just the fields isDoctorBookable() reads.
export const DOCTOR_BOOKABLE_SELECT = {
  role: true,
  deletedAt: true,
  doctorProfile: { select: { status: true, isVerified: true, trialEndsAt: true, subscriptionPaidUntil: true } },
} as const;
