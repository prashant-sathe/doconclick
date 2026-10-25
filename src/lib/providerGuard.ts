import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";
import { doctorAccessProblem, SUBSCRIPTION_EXPIRED_CODE, type DoctorGuardOptions } from "@/lib/doctorGuard";
import { resolveDoctorScope } from "@/lib/staffGuard";

// Nurses reuse the appointment / payment / chat / payout machinery that was
// built for doctors (Appointment.doctorId holds the nurse's user id). These
// helpers are for the routes both kinds of provider share — anything
// clinical (prescriptions, clinics, video) stays DOCTOR-only.

export const PROVIDER_ROLES = ["DOCTOR", "NURSE"] as const;

export function isProviderRole(role: string | undefined | null): boolean {
  return role === "DOCTOR" || role === "NURSE";
}

export const NURSE_SUSPENDED_MESSAGE =
  "Your account has been suspended by the admin. Contact support for assistance.";

/** 403 response if this nurse is suspended, otherwise null. */
export async function requireActiveNurse(
  authUser: JWTPayload,
  { requireSubscription = false }: DoctorGuardOptions = {},
): Promise<NextResponse | null> {
  const profile = await prisma.nurseProfile.findUnique({
    where: { userId: authUser.id },
    select: { status: true, registrationFeePaid: true, subscriptionPaidUntil: true },
  });
  if (!profile) return NextResponse.json({ error: "Nurse profile not found" }, { status: 404 });
  if (profile.status === "SUSPENDED") {
    return NextResponse.json({ error: NURSE_SUSPENDED_MESSAGE, suspended: true }, { status: 403 });
  }
  if (requireSubscription) {
    // Only when the admin actually charges nurses (fees > 0); fee 0 = no gate.
    const settings = await prisma.platformSettings.findFirst({
      select: { nurseRegistrationFee: true, nurseSubscriptionFee: true },
    });
    if (nurseFeesOverdue(profile, settings)) {
      return NextResponse.json(
        { error: "Your DocOnClick plan has expired. Renew it to keep accepting and completing appointments.", code: SUBSCRIPTION_EXPIRED_CODE },
        { status: 403 },
      );
    }
  }
  return null;
}

/** True when a charged nurse fee (registration or subscription) is unpaid/expired. */
export function nurseFeesOverdue(
  profile: { registrationFeePaid: boolean; subscriptionPaidUntil: Date | string | null },
  settings: { nurseRegistrationFee: number; nurseSubscriptionFee: number } | null,
): boolean {
  if ((settings?.nurseRegistrationFee ?? 0) > 0 && !profile.registrationFeePaid) return true;
  if ((settings?.nurseSubscriptionFee ?? 0) > 0) {
    if (!profile.subscriptionPaidUntil || new Date(profile.subscriptionPaidUntil).getTime() <= Date.now()) return true;
  }
  return false;
}

/**
 * Like resolveDoctorScope, but also accepts a NURSE (scoped to their own
 * id). Use in shared appointment-queue routes only.
 */
export async function resolveProviderScope(
  authUser: JWTPayload,
  options: DoctorGuardOptions = {}
): Promise<{ doctorId: string; denied: null } | { doctorId: null; denied: NextResponse }> {
  if (authUser.role === "NURSE") {
    const denied = await requireActiveNurse(authUser, options);
    if (denied) return { doctorId: null, denied };
    return { doctorId: authUser.id, denied: null };
  }
  return resolveDoctorScope(authUser, options);
}

/**
 * 403 if a DOCTOR or NURSE caller is suspended — or, with
 * `requireSubscription`, a doctor out of plan (nurses' fees: only via
 * resolveProviderScope, so payout/settlements stay open to them); null for everyone else.
 */
export async function requireActiveProvider(authUser: JWTPayload, options: DoctorGuardOptions = {}): Promise<NextResponse | null> {
  if (authUser.role === "NURSE") return requireActiveNurse(authUser);
  if (authUser.role === "DOCTOR") return doctorAccessProblem(authUser.id, options);
  return null;
}

/** Whether a nurse can currently receive bookings (approved, located, fees settled). */
export function isNurseBookable(
  profile: { status: string; registrationFeePaid: boolean; subscriptionPaidUntil: Date | string | null; lat: number | null; lng: number | null },
  settings: { nurseRegistrationFee: number; nurseSubscriptionFee: number } | null,
): boolean {
  if (profile.status !== "APPROVED") return false;
  // Matching is by distance — a nurse with no base location would show up
  // for (and be bookable by) patients anywhere.
  if (profile.lat == null || profile.lng == null) return false;
  if ((settings?.nurseRegistrationFee ?? 0) > 0 && !profile.registrationFeePaid) return false;
  if ((settings?.nurseSubscriptionFee ?? 0) > 0) {
    if (!profile.subscriptionPaidUntil || new Date(profile.subscriptionPaidUntil).getTime() <= Date.now()) return false;
  }
  return true;
}
